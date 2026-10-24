/* ==========================================================================
   TRACKBALL FOOTBALL — main.js
   App state machine, main loop, screens, touch layer and the glue between
   the trackball, simulation, networking, renderer and sound.
     modes: 'attract' (CPU vs CPU behind the title screen)
            'cpu'     (you = XPRESS vs the computer)
            'host'    (online two-player, you = XPRESS, runs the sim and broadcasts)
            'guest'   (online two-player, you = OUTLAWS, sends input, renders host state)
   Play-call secrecy: Sim.snapshot() never contains a call before the snap; the
   guest's call only leaves its device after the host says both sides locked.
   ========================================================================== */
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
const HALVES = [90, 150, 240], DIFFS = ['ROOKIE', 'PRO', 'ALL-PRO'];

const App = {
  screen: 'title', mode: null, me: 0, snap: null, touch: false, testMouse: false, timeScale: 1,
  opts: { diff: clamp(+(localStorage.getItem('tbf.diff') ?? 1), 0, 2), half: HALVES.includes(+localStorage.getItem('tbf.half')) ? +localStorage.getItem('tbf.half') : 150 },
  acc: 0, paused: false, lastEv: 0, lastGid: null, prevPh: null, Sel: { idx: 0, locked: false, list: [], key: '' },
  remote: { x: 0, y: 0, m: 0, aP: false, bP: false, ac: 0, bc: 0, n: 0, tta: null }, press: { ac: 0, bc: 0, tta: null }, flash: null,
  guestPick: null, needT: 0, bcastT: 0, sseq: 0, lastSeq: 0, lastAt: 0, iv: 1000 / 60, jit: 2, delay: 25, guestBuf: [], iseq: 0, lastIn: '', inT: 0, pred: null, wasPicking: false,
  rematchSent: false, hadLock: false, L: null, lastFrameMs: 16, gidLocal: 0,

  go(name, o) {
    const cur = SCREENS[this.screen]; if (cur && cur.exit) cur.exit();
    this.screen = name; UI.resetFocus(); const s = SCREENS[name]; if (s && s.enter) s.enter(o);
    document.documentElement.classList.toggle('ingame', name === 'game');
    if (name !== 'game') Track.releaseLock();
  },
  startAttract() { this.mode = 'attract'; this.me = null; Sim.newGame({ human: [false, false], diff: 2, half: 900 }); this.gidLocal = Sim.G.gid; this.snap = Sim.snapshot(); this.acc = 0; this.lastEv = 0; },
  startGame(mode) {
    this.mode = mode; this.paused = false; this.acc = 0; this.lastEv = 0; this.prevPh = null; this.rematchSent = false; this.guestPick = null;
    this.me = mode === 'guest' ? 1 : 0;
    this.Sel = { idx: 0, locked: false, list: [], key: '', flip: false };
    // online the host's sim keeps FLIP formations hidden until the snap (secret); vs the CPU they line up right away
    if (mode !== 'guest') { Sim.newGame({ human: mode === 'cpu' ? [true, false] : [true, true], diff: this.opts.diff, half: this.opts.half, secret: mode === 'host' }); this.snap = Sim.snapshot(); }
    else { this.snap = null; }
    Track.stop(); Track.clearNav();
    this.go('game'); Sound.play('whistle'); Sound.cheer(0.5, 2);
  },
  rematch() {
    if (this.mode === 'guest') { Net.send({ t: 'rematch' }); this.rematchSent = true; return; }
    this.startGame(this.mode);
  },
  quit() { if (this.mode === 'host' || this.mode === 'guest') Net.leave(); this.paused = false; this.startAttract(); this.go('title'); },
  lockPick(id, flip) {
    const A = this; if (A.Sel.locked) return;
    if (flip === undefined) flip = !!A.Sel.flip;
    A.Sel.locked = true; Sound.play('lock');
    if (A.mode === 'guest') { A.guestPick = { id, f: flip ? 1 : 0 }; Net.send({ t: 'lock' }); } // the call (and its FLIP) waits for the host's 'need'
    else Sim.pick(A.me, id, flip);
  },
};

/* ---------------- networking glue ---------------- */
Net.onMessage = d => {
  const A = App;
  if (Net.st.role === 'host') {
    if (d.t === 'hello') { A.remote.n = 0; return; }
    if (d.t === 'i') {
      const r = A.remote;
      if (d.n != null) { if (d.n <= (r.n || 0)) return; r.n = d.n; }
      r.x = clamp(+d.x || 0, -1.2, 1.2); r.y = clamp(+d.y || 0, -1.2, 1.2); r.m = clamp(+d.m || 0, 0, 1.2);
      if (d.ac !== r.ac) { r.ac = d.ac; r.aP = true; r.tta = typeof d.tt === 'number' ? d.tt : null; } if (d.bc !== r.bc) { r.bc = d.bc; r.bP = true; }
    } else if (d.t === 'lock' && A.mode === 'host' && Sim.G && Sim.G.phase === 'select') Sim.lock(1);
    else if (d.t === 'pick' && A.mode === 'host' && Sim.G && Sim.G.phase === 'select' && Sim.G.pend[1] && Sim.G.picks[0] && typeof d.id === 'string') Sim.pick(1, d.id, d.f === 1);
    else if (d.t === 'rematch' && A.mode === 'host' && Sim.G && Sim.G.over) A.startGame('host');
  } else if (Net.st.role === 'guest') {
    if (d.t === 'hello') { A.lastSeq = 0; A.guestBuf = []; A.pred = null; return; }
    if (d.t === 's' && d.s) {
      const at = performance.now();
      if (d.n != null) { if (d.n <= A.lastSeq) return; A.lastSeq = d.n; }
      if (A.lastAt) { const gap = Math.min(250, at - A.lastAt); A.iv += (gap - A.iv) * 0.08; A.jit += (Math.abs(gap - A.iv) - A.jit) * 0.08; }
      A.lastAt = at; A.delay = clamp(1.5 * A.iv + 2 * A.jit, 16, 120);
      A.guestBuf.push({ at, s: d.s }); if (A.guestBuf.length > 24) A.guestBuf.shift();
      if (A.screen === 'connecting') A.startGame('guest');
    } else if (d.t === 'need' && A.mode === 'guest' && A.guestPick && A.snap && A.snap.ph === 'select') Net.send({ t: 'pick', id: A.guestPick.id, f: A.guestPick.f });
  }
};
const lerpA = (a, b, u) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * u; };
function lerpSnap(a, b, u) {
  if (a.ph !== b.ph || a.gid !== b.gid) return b;
  const o = Object.assign({}, b);
  o.pl = b.pl.map((q, i) => { const p = a.pl[i]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 5) return q; const r = q.slice(); r[0] = p[0] + (q[0] - p[0]) * u; r[1] = p[1] + (q[1] - p[1]) * u; r[2] = lerpA(p[2], q[2], u); r[3] = p[3] + (q[3] - p[3]) * u; return r; });
  if (a.b[3] === b.b[3] && a.b[4] === b.b[4]) { o.b = b.b.slice(); for (let k = 0; k < 3; k++) o.b[k] = a.b[k] + (b.b[k] - a.b[k]) * u; }
  if (a.ba != null && b.ba != null) o.ba = a.ba + (b.ba - a.ba) * u;
  return o;
}
function guestSnapshot() {
  const B = App.guestBuf; if (!B.length) return null;
  const rt = performance.now() - App.delay;
  for (let k = B.length - 1; k > 0; k--) if (B[k - 1].at <= rt && B[k].at > rt) return lerpSnap(B[k - 1].s, B[k].s, (rt - B[k - 1].at) / (B[k].at - B[k - 1].at));
  return B[B.length - 1].s;
}
/** guest-side prediction of its own controlled runner: moves instantly with the trackball, pulled toward the host's newest state */
function predictOwn(S, cmd, dt) {
  const A = App, B = A.guestBuf, L = B.length && B[B.length - 1].s, me = 1;
  if (A.noPredict || !L) { A.pred = null; return S; }
  const i = S.ctl[me];
  const ok = S.ph === 'live' && L.ph === 'live' && L.ctl[me] === i && L.pl[i][4] === 0 && S.pl[i][4] === 0 && !L.w && (L.kind === 'run' || L.kind === 'pass');
  if (!ok) { A.pred = null; return S; }
  const srv = L.pl[i], off = S.off === me, slot = i % 7, role = off ? OFF_ROLE[slot] : DEF_ROLE[slot];
  const f = (role === 'C' || role === 'LG' || role === 'RG' || role === 'DT') ? 0.86 : role === 'DE' ? 0.92 : 1, top = BASE_V[role] * f * 1.16;
  let P = A.pred; if (!P || P.i !== i) P = A.pred = { i, x: srv[0], y: srv[1], vx: Math.cos(srv[2]) * srv[3], vy: Math.sin(srv[2]) * srv[3], fa: srv[2] };
  const wx = cmd.x * top, wy = cmd.y * top, acc = 24 * dt, dvx = wx - P.vx, dvy = wy - P.vy, dm = Math.hypot(dvx, dvy);
  if (dm <= acc) { P.vx = wx; P.vy = wy; } else { P.vx += dvx / dm * acc; P.vy += dvy / dm * acc; }
  P.x += P.vx * dt; P.y += P.vy * dt;
  const lead = clamp((Net.st.ping || 60) / 1000, 0, 0.25), tx = srv[0] + P.vx * lead, ty = srv[1] + P.vy * lead, ex = tx - P.x, ey = ty - P.y;
  if (Math.hypot(ex, ey) > 4) { P.x = tx; P.y = ty; } else { const k = Math.min(1, dt * 6); P.x += ex * k; P.y += ey * k; }
  const sp = Math.hypot(P.vx, P.vy); if (sp > 0.6) P.fa = lerpA(P.fa, Math.atan2(P.vy, P.vx), Math.min(1, dt * 12));
  const o = Object.assign({}, S); o.pl = S.pl.slice(); const q = S.pl[i];
  o.pl[i] = [P.x, P.y, P.fa, sp, q[4], q[5], q[6]];
  if (S.b[4] === i && S.b[3] === 0) { o.b = S.b.slice(); o.b[0] = P.x; o.b[1] = P.y; }
  return o;
}

/* ---------------- layout (CSS px; drawing happens at full device resolution) ---------------- */
let DPR = 1;
function readSafe() {
  const el = document.getElementById('safe'); if (!el) return { t: 0, r: 0, b: 0, l: 0 };
  const cs = getComputedStyle(el); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  DPR = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const safe = readSafe(), touch = App.touch, portrait = H > W * 1.05, small = Math.min(W, H) < 520;
  const L = { W, H, safe, touch, portrait: touch && portrait, small, field: { x: 0, y: 0, w: W, h: H } };
  if (touch && portrait) {
    const ph = clamp(Math.round(H * 0.34), 200, 330);
    L.field = { x: 0, y: 0, w: W, h: H - ph };
    L.panel = { x: 0, y: H - ph, w: W, h: ph };
    const R = Math.min(W * 0.235, (ph - safe.b) * 0.36);
    L.tb = { cx: Math.round(W * 0.35), cy: Math.round(H - ph + (ph - safe.b) * 0.52), R };
    L.act = { cx: Math.round(W * 0.82), cy: L.tb.cy + R * 0.25, R: Math.min(W * 0.115, 54) };
    L.alt = { cx: L.act.cx - L.act.R * 0.25, cy: L.act.cy - L.act.R * 1.9, R: L.act.R * 0.58 };
    L.zone = { x: 0, y: H - ph, w: W * 0.66, h: ph };
  } else if (touch) {
    const R = clamp(H * 0.19, 46, 92);
    L.tb = { cx: Math.round(safe.l + R * 1.3 + 12), cy: Math.round(H - safe.b - R * 1.3 - 8), R };
    const aR = clamp(H * 0.12, 34, 56);
    L.act = { cx: Math.round(W - safe.r - aR * 1.35 - 12), cy: Math.round(H - safe.b - aR * 1.45 - 10), R: aR };
    L.alt = { cx: L.act.cx - aR * 2.0, cy: L.act.cy - aR * 1.25, R: aR * 0.6 };
    L.zone = { x: 0, y: H * 0.16, w: W * 0.52, h: H * 0.84 };
  } else {
    L.tb = { cx: Math.round(safe.l + 64), cy: Math.round(H - safe.b - 64), R: 36 };
  }
  App.L = L;
  Render.layout(W, H, DPR, L.field, touch);
  document.documentElement.classList.toggle('touch', touch);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

/* ---------------- pointer / touch layer ---------------- */
const touches = new Map(); // pointerId -> { kind: 'ball' | 'act' | 'alt' | 'ui', x, y }
const btnDown = { act: 0, alt: 0 };
const inCircle = (c, x, y, k) => c && Math.hypot(x - c.cx, y - c.cy) <= c.R * (k || 1.35);
const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function gameControlsActive() { const S = App.snap; return App.screen === 'game' && !App.paused && S && !S.over; }
canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); Sound.unlock();
  const x = e.clientX, y = e.clientY, L = App.L;
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    if (!App.touch) { App.touch = true; resize(); }
    if (gameControlsActive()) {
      if (inCircle(L.act, x, y)) { touches.set(e.pointerId, { kind: 'act' }); Track.press(); btnDown.act = 1; return; }
      if (inCircle(L.alt, x, y, 1.25)) { touches.set(e.pointerId, { kind: 'alt' }); Track.pressAlt(); btnDown.alt = 1; return; }
    }
    if (UI.tap(x, y)) { touches.set(e.pointerId, { kind: 'ui' }); return; }
    if (gameControlsActive() && (inRect(L.zone, x, y) || inCircle(L.tb, x, y, 1.4))) {
      touches.set(e.pointerId, { kind: 'ball', x, y }); Track.touchDown(); return;
    }
    touches.set(e.pointerId, { kind: 'none' });
    return;
  }
  // mouse / trackpad click
  if (Track.st.locked) return; // trackball.js handles buttons while grabbed
  if (UI.tap(x, y)) return;
  if (App.screen === 'game' && !App.paused && App.snap && !App.snap.over) Track.requestLock();
});
window.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId); if (!t || t.kind !== 'ball') return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const c of (evs.length ? evs : [e])) { Track.feed('touch', c.clientX - t.x, c.clientY - t.y); t.x = c.clientX; t.y = c.clientY; }
}, { passive: true });
function endTouch(e) {
  const t = touches.get(e.pointerId); if (!t) return; touches.delete(e.pointerId);
  if (t.kind === 'ball' && ![...touches.values()].some(o => o.kind === 'ball')) Track.touchUp();
  if (t.kind === 'act') btnDown.act = 0; if (t.kind === 'alt') btnDown.alt = 0;
}
window.addEventListener('pointerup', endTouch); window.addEventListener('pointercancel', endTouch);
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) App.hadLock = true;
  else if (App.hadLock && App.screen === 'game' && App.snap && !App.snap.over && !App.paused) { App.paused = true; Sound.play('back'); }
  if (!locked) { if (App.hadLock) App.unlockAt = performance.now(); App.hadLock = false; }
});

/* ---------------- small text helpers ---------------- */
function para(c, s, x, y, w, font, col, lh, align) {
  c.font = font; c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'top';
  let yy = y;
  for (const block of s.split('\n')) {
    const words = block.split(' '); let line = '';
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (c.measureText(t).width > w && line) { c.fillText(line, align === 'center' ? x + w / 2 : x, yy); yy += lh; line = wd; } else line = t; }
    c.fillText(line, align === 'center' ? x + w / 2 : x, yy); yy += lh;
  }
  return yy;
}
function panel(c, x, y, w, h, col) {
  c.fillStyle = 'rgba(5,7,16,0.9)'; UI.rr(c, x, y, w, h, 16); c.fill();
  c.strokeStyle = col || 'rgba(255,210,60,0.45)'; c.lineWidth = 1.5; c.stroke();
}
function backdrop(c, dt) {
  // the attract game, dimmed
  const L = App.L; Render.draw(c, App.snap, dt, null);
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, L.H); g.addColorStop(0, 'rgba(0,0,8,0.78)'); g.addColorStop(0.5, 'rgba(0,0,8,0.45)'); g.addColorStop(1, 'rgba(0,0,8,0.82)');
  c.fillStyle = g; c.fillRect(0, 0, L.W, L.H);
}
function runAttract(dt) {
  if (App.mode !== 'attract' || !Sim.G) App.startAttract();
  App.acc = Math.min(App.acc + dt, 0.1);
  while (App.acc >= STEP) { Sim.update(STEP, [null, null]); App.acc -= STEP; }
  if (Sim.G.over || Sim.G.half === 2) App.startAttract();
  App.snap = Sim.snapshot();
  Render.follow(App.snap, dt, false, null);
}
function iconButtons(c) { // sound toggle (and pause in game), top right
  const L = App.L, s = L.small ? 34 : 38, inPanel = L.panel && App.screen === 'game', x = L.W - L.safe.r - s - 8, y = inPanel ? L.panel.y + 6 : L.safe.t + 8;
  UI.button(c, Sound.on ? '\u266A' : '\u00D7\u266A', x, y, s, s, () => { Sound.unlock(); Sound.toggle(); }, { focusable: false, size: 18 });
  if (App.screen === 'game' && !(App.snap && App.snap.over)) UI.button(c, 'II', x - s - 8, y, s, s, () => { App.paused = !App.paused; }, { focusable: false, size: 15 });
}
function menuColumn(c, items, top) {
  const L = App.L, w = Math.min(L.W - 40, L.small ? 340 : 420), h = L.small ? 40 : 50, gap = L.small ? 8 : 12, x = L.W / 2 - w / 2;
  items.forEach((it, i) => UI.button(c, it[0], x, top + i * (h + gap), w, h, it[1], { lr: it[2], size: L.small ? 15 : 19, fam: DFONT }));
  return top + items.length * (h + gap);
}

/* ---------------- screens ---------------- */
const Title = {
  t: 0, enter() { this.t = 0; if (App.mode !== 'attract') App.startAttract(); },
  update(dt, typed) { this.t += dt; runAttract(dt); UI.handleKeys(typed); Sound.music(0.9); Sound.crowd(0.15 + (App.snap ? App.snap.ex * 0.5 : 0), dt); },
  draw(c, dt) {
    const L = App.L; backdrop(c, dt);
    const s = Math.min(L.W / 7.2, L.H / (L.small ? 6.2 : 7.5), 110);
    const ly = L.safe.t + s * 1.15 + (L.small ? 6 : 24);
    UI.logo(c, L.W / 2, ly, s);
    UI.text(c, 'PRO STADIUM EDITION · 7 ON 7 · INSPIRED BY THE 1978 COIN-OP', L.W / 2, ly + s * 1.05, UI.f(700, L.small ? 11 : 14, DFONT), '#c9d0ee');
    const top = Math.max(ly + s * 1.35, L.H * 0.42);
    const yEnd = menuColumn(c, [
      ['PLAY VS COMPUTER', () => App.startGame('cpu')],
      ['TWO-PLAYER GAME (ONLINE)', () => { Net.host(); App.go('hostwait'); }],
      ['JOIN TWO-PLAYER GAME IN PROGRESS', () => { Net.joinAny(); App.go('connecting'); }],
      ['HOW TO PLAY', () => App.go('howto')],
      ['OPTIONS', () => App.go('options')],
    ], top);
    if (yEnd + 26 < L.H - L.safe.b) UI.text(c, DIFFS[App.opts.diff] + '  ·  ' + UI.clockStr(App.opts.half) + ' HALVES  ·  ' + (App.touch ? 'SWIPE THE BALL TO RUN' : 'CLICK TO GRAB THE TRACKBALL'), L.W / 2, Math.min(L.H - L.safe.b - 16, yEnd + 18), UI.f(700, L.small ? 11 : 13, DFONT), '#8f98c2');
    iconButtons(c);
  },
};
const Options = {
  update(dt, typed) { runAttract(dt); if (typed.some(e => e.code === 'Escape' || e.code === 'Backspace')) App.go('title'); UI.handleKeys(typed); },
  draw(c, dt) {
    const L = App.L, o = App.opts; backdrop(c, dt);
    UI.text(c, 'OPTIONS', L.W / 2, L.safe.t + (L.small ? 34 : 70), UI.f('italic 900', L.small ? 26 : 40, DFONT), '#ffd23c');
    const cyc = (k, list, dir) => { const i = (list.indexOf(o[k]) + dir + list.length) % list.length; o[k] = list[i]; localStorage.setItem('tbf.' + k, o[k]); };
    const dd = d => { o.diff = (o.diff + d + 3) % 3; localStorage.setItem('tbf.diff', o.diff); };
    menuColumn(c, [
      ['CPU DIFFICULTY:  \u25C0 ' + DIFFS[o.diff] + ' \u25B6', () => dd(1), dd],
      ['HALF LENGTH:  \u25C0 ' + UI.clockStr(o.half) + ' \u25B6', () => cyc('half', HALVES, 1), d => cyc('half', HALVES, d)],
      ['SOUND:  ' + (Sound.on ? 'ON' : 'OFF'), () => { Sound.unlock(); Sound.toggle(); }],
      ['MUSIC:  ' + (Sound.musicOn ? 'ON' : 'OFF'), () => Sound.toggleMusic()],
      ['TRACKPAD SCROLL:  ' + (Track.st.invertWheel ? 'INVERTED' : 'NATURAL'), () => Track.setInvertWheel(!Track.st.invertWheel)],
      ['BACK', () => App.go('title')],
    ], L.safe.t + (L.small ? 62 : 120));
    UI.text(c, 'ONLINE GAMES USE THE HOST\u2019S HALF LENGTH.', L.W / 2, L.H - L.safe.b - 18, UI.f(700, 12, DFONT), '#8f98c2');
  },
};
const HOWTO = [
  ['THE TRACKBALL', 'Your player runs as fast as the ball spins. Stroke it hard and he sprints; stroke it gently and he jogs; let go and the ball coasts and slows on its own, just like the heavy cabinet ball. Stroke against the spin to brake.\n\nMAC: click the field to grab the trackball (the pointer disappears) and roll your mouse or trackpad. Or just two-finger swipe on the trackpad. Esc lets go.\nIPHONE / IPAD: swipe and flick anywhere in the trackball area (the big red ball). Keep your finger on it to stop.\nKEYS / GAMEPAD also work: arrows or WASD, Space = action, Shift = next, F = flip.'],
  ['CALLING PLAYS', 'Before every down both sides secretly call a play. You only ever see your own playbook, and your opponent only sees that you are choosing or locked in. Both calls are revealed at the snap.\n\nRoll the trackball or use the arrow keys to pick a card, then click / Space / tap again to lock it in. You have 14 seconds.\nFLIP mirrors your play left-right (formation, routes, run direction, coverage): press F or Shift (or right-click), tap FLIP or the blue button, or a gamepad shoulder button. The diagrams flip so you can see it. Your flip stays secret until the snap too.'],
  ['OFFENSE', 'Press ACTION (click / Space / the red button) to hike. You control the quarterback: drop back, and the cyan ring shows your target receiver (NEXT or Shift cycles it). ACTION throws. Lead your receivers.\nOn runs the ball is handed off and you take over the runner. ACTION gives a burst juke. When a defender wraps you up, spin the trackball like crazy to break free.\nFourth down: PUNT or FIELD GOAL (when in range).'],
  ['DEFENSE', 'You control the defender with the yellow ring. ACTION (Space / click / red button) jumps you to the defender closest to the ball: the runner, or where a pass is coming down. Near the runner, ACTION is a DIVING TACKLE. NEXT (Shift) cycles defenders. Before the snap ACTION picks your man.\nWhen you grab the runner, spin the trackball hard to drive him down. Hit him at full speed for a BIG HIT and maybe a fumble.'],
  ['INTERCEPTIONS', 'Pass in the air? Press ACTION once to take the defender closest to where it is coming down, steer him under it, then press ACTION again right as the ball arrives to lunge for it.\nPERFECT timing (within about a tenth of a second) and within a yard or two of the catch gives a real shot at a pick. EARLY or LATE, or too far away, usually only breaks it up. Guessing early makes you stumble, so mashing does not work.\nGot it? You steer the return. Take it to the house!'],
  ['TWO-PLAYER ONLINE', 'Each player uses their own device, anywhere.\n1. You pick TWO-PLAYER GAME (ONLINE).\n2. Your buddy opens the Behram Arcade, picks Trackball Football and taps JOIN TWO-PLAYER GAME IN PROGRESS. No code needed; the game finds you. A backup room code is on your screen just in case.\nYou are XPRESS (red), your buddy is OUTLAWS (blue). Play calls stay secret until the snap.'],
];
const Howto = {
  page: 0, enter() { this.page = 0; },
  update(dt, typed) {
    runAttract(dt);
    for (const e of typed) { if (e.code === 'Escape' || e.code === 'Backspace') { App.go('title'); return; } if (e.code === 'ArrowRight' || e.code === 'KeyD') this.page = Math.min(HOWTO.length - 1, this.page + 1); if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.page = Math.max(0, this.page - 1); }
    UI.handleKeys(typed.filter(e => e.code !== 'ArrowLeft' && e.code !== 'ArrowRight'));
  },
  draw(c, dt) {
    const L = App.L; backdrop(c, dt);
    const w = Math.min(L.W - 24 - L.safe.l - L.safe.r, 720), x = L.W / 2 - w / 2, y = L.safe.t + 10, h = L.H - L.safe.t - L.safe.b - 20;
    panel(c, x, y, w, h);
    const pg = HOWTO[this.page], fs = L.small ? 13 : 16;
    UI.text(c, 'HOW TO PLAY · ' + pg[0], L.W / 2, y + (L.small ? 22 : 34), UI.f('italic 900', L.small ? 17 : 24, DFONT), '#ffd23c');
    para(c, pg[1], x + 22, y + (L.small ? 42 : 66), w - 44, UI.f(500, fs, FONT), '#e8ecff', fs * 1.38);
    if (this.page === 0) Render.drawTrackball(c, x + w - 60, y + 50, 28, {});
    const bh = L.small ? 36 : 44, by = y + h - bh - 12, bw = (w - 60) / 3;
    UI.button(c, '\u25C0 PREV', x + 15, by, bw, bh, () => { this.page = Math.max(0, this.page - 1); }, { fam: DFONT });
    UI.button(c, (this.page + 1) + ' / ' + HOWTO.length + '  NEXT \u25B6', x + 30 + bw, by, bw, bh, () => { this.page = (this.page + 1) % HOWTO.length; }, { fam: DFONT });
    UI.button(c, 'BACK', x + 45 + bw * 2, by, bw, bh, () => App.go('title'), { fam: DFONT });
  },
};
const HostWait = {
  t: 0, connT: -1, enter() { this.t = 0; this.connT = -1; },
  update(dt, typed) {
    this.t += dt; runAttract(dt); Sound.music(0.6);
    if (typed.some(e => e.code === 'Escape')) { Net.leave(); App.go('title'); return; }
    UI.handleKeys(typed);
    if (Net.st.status === 'connected' && this.connT < 0) { this.connT = this.t; Sound.cheer(0.8, 2.5); }
    if (this.connT >= 0 && this.t - this.connT > 1.6) App.startGame('host');
  },
  draw(c, dt) {
    const L = App.L, s = Net.st; backdrop(c, dt);
    const w = Math.min(L.W - 24, 640), x = L.W / 2 - w / 2, y = L.safe.t + 10, h = L.H - L.safe.t - L.safe.b - 20, sm = L.small;
    panel(c, x, y, w, h);
    UI.text(c, 'TWO-PLAYER GAME', L.W / 2, y + (sm ? 22 : 36), UI.f('italic 900', sm ? 20 : 30, DFONT), '#ffd23c');
    if (s.status === 'error') {
      para(c, s.error, x + 30, y + h * 0.3, w - 60, UI.f(700, sm ? 14 : 18, DFONT), '#ff8a8a', 24, 'center');
      UI.button(c, 'TRY AGAIN', x + 30, y + h - 70, (w - 80) / 2, 46, () => { Net.host(); this.connT = -1; });
      UI.button(c, 'MENU', x + 50 + (w - 80) / 2, y + h - 70, (w - 80) / 2, 46, () => { Net.leave(); App.go('title'); });
      return;
    }
    let yy = y + (sm ? 44 : 70);
    if (s.status === 'connected') {
      UI.text(c, 'YOUR BUDDY IS HERE!', L.W / 2, y + h * 0.4, UI.f('italic 900', sm ? 24 : 36, DFONT), '#7cff7a');
      UI.text(c, 'KICKOFF COMING UP · YOU ARE XPRESS (RED)', L.W / 2, y + h * 0.4 + 40, UI.f(700, sm ? 13 : 16, DFONT), '#fff');
      return;
    }
    yy = para(c, 'Call your buddy and tell them to hop on their bike and head over. The game is loading\u2026 just like the old days.', x + 28, yy, w - 56, UI.f('italic 700', sm ? 15 : 20, FONT), '#ffffff', sm ? 20 : 27, 'center');
    // a C-64-style loading bar that never quite finishes
    const bw = w - 120, bx = x + 60, byy = yy + 8, k = (this.t * 0.11) % 1, stripes = Math.floor(this.t * 12);
    c.fillStyle = '#0b0f22'; c.fillRect(bx, byy, bw, 14);
    for (let i = 0; i < 24; i++) { c.fillStyle = ['#ff4a5a', '#ffd23c', '#7cff7a', '#5fa0ff'][(i + stripes) % 4]; c.fillRect(bx + i * bw / 24, byy, bw / 24 - 2, 14 * (i / 24 < 0.35 + 0.6 * k ? 1 : 0.18)); }
    yy = byy + 30;
    const dots = '...'.slice(0, (this.t * 2 | 0) % 4);
    UI.text(c, s.status === 'opening' ? 'SETTING UP THE GAME' + dots : 'WAITING FOR YOUR BUDDY' + dots, L.W / 2, yy, UI.f(800, sm ? 15 : 19, DFONT), '#ffd23c'); yy += sm ? 24 : 34;
    yy = para(c, 'They open the Behram Arcade, pick TRACKBALL FOOTBALL and tap JOIN TWO-PLAYER GAME IN PROGRESS. No code needed; the game finds you.', x + 34, yy, w - 68, UI.f(500, sm ? 12 : 15, FONT), '#c9d0ee', sm ? 16 : 21, 'center');
    const code = s.code || '.....';
    const cy = Math.min(yy + (sm ? 12 : 22), y + h - (sm ? 104 : 140));
    UI.text(c, 'BACKUP ROOM CODE', L.W / 2, cy, UI.f(700, sm ? 11 : 13, DFONT), '#8f98c2');
    UI.text(c, code.split('').join(' '), L.W / 2, cy + (sm ? 22 : 30), UI.f(900, sm ? 24 : 34, FONT), '#ffe27a');
    UI.button(c, 'CANCEL', L.W / 2 - 80, y + h - (sm ? 50 : 62), 160, sm ? 38 : 46, () => { Net.leave(); App.go('title'); });
  },
};
const Connecting = {
  t: 0, enter() { this.t = 0; },
  retry() { this.t = 0; if (Net.st.via === 'code') Net.join(CodeEntry.code); else Net.joinAny(); },
  update(dt, typed) { this.t += dt; runAttract(dt); if (typed.some(e => e.code === 'Escape')) { Net.leave(); App.go('title'); return; } UI.handleKeys(typed); },
  draw(c, dt) {
    const L = App.L, s = Net.st, sm = L.small; backdrop(c, dt);
    const w = Math.min(L.W - 24, 640), x = L.W / 2 - w / 2, h = Math.min(L.H - L.safe.t - L.safe.b - 20, 380), y = L.H / 2 - h / 2;
    panel(c, x, y, w, h);
    if (s.status === 'nogame' || s.status === 'error') {
      const none = s.status === 'nogame' && !s.error;
      UI.text(c, none ? 'NO GAME WAITING' : 'NO CONNECTION', L.W / 2, y + (sm ? 30 : 44), UI.f('italic 900', sm ? 22 : 30, DFONT), '#ff8a8a');
      para(c, none ? 'Ask your buddy to start a TWO-PLAYER GAME (ONLINE) on their device first, then try again.' : s.error, x + 30, y + (sm ? 56 : 84), w - 60, UI.f(600, sm ? 13 : 17, FONT), '#fff', sm ? 18 : 24, 'center');
      const bh = sm ? 38 : 46, by = y + h - bh - 16, bw = (w - 60) / 3;
      UI.button(c, 'RETRY', x + 15, by, bw, bh, () => this.retry());
      UI.button(c, 'ENTER CODE INSTEAD', x + 30 + bw, by, bw, bh, () => App.go('code'));
      UI.button(c, 'BACK', x + 45 + bw * 2, by, bw, bh, () => { Net.leave(); App.go('title'); });
      return;
    }
    const found = s.status === 'connected', dots = '...'.slice(0, (this.t * 2 | 0) % 4);
    UI.text(c, found ? 'FOUND YOUR BUDDY!' : s.via === 'code' ? 'CONNECTING' : 'LOOKING FOR A GAME', L.W / 2, y + h * 0.25, UI.f('italic 900', sm ? 22 : 32, DFONT), found ? '#7cff7a' : '#ffd23c');
    UI.text(c, found ? 'YOU ARE OUTLAWS (BLUE) · WAITING FOR KICKOFF' + dots : s.via === 'code' ? 'DIALING ROOM ' + s.code + dots : 'IN PROGRESS' + dots, L.W / 2, y + h * 0.25 + 36, UI.f(700, sm ? 13 : 16, DFONT), '#fff');
    Render.drawTrackball(c, L.W / 2, y + h * 0.58, sm ? 22 : 30, { meter: false });
    Track.feed('wheel', 0, 0);
    UI.button(c, 'CANCEL', L.W / 2 - 80, y + h - (sm ? 54 : 66), 160, sm ? 38 : 46, () => { Net.leave(); App.go('title'); });
  },
};
const CodeEntry = {
  code: '', enter() { this.code = ''; Net.leave(); },
  add(ch) { ch = ch.toUpperCase(); if (ch === 'I') ch = 'J'; if (this.code.length < 5 && Net.ALPH.includes(ch)) { this.code += ch; Sound.play('move'); } },
  del() { this.code = this.code.slice(0, -1); Sound.play('back'); },
  go() { if (this.code.length === 5) { Sound.play('lock'); Net.join(this.code); App.go('connecting'); } },
  update(dt, typed) {
    runAttract(dt);
    for (const e of typed) {
      if (e.code === 'Escape') { App.go('title'); return; }
      if (e.code === 'Backspace') this.del(); else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.go(); else if (e.key && e.key.length === 1) this.add(e.key);
    }
  },
  draw(c, dt) {
    const L = App.L, sm = L.small; backdrop(c, dt);
    const w = Math.min(L.W - 16, 640), x = L.W / 2 - w / 2, y = L.safe.t + 8, h = L.H - L.safe.t - L.safe.b - 16;
    panel(c, x, y, w, h);
    UI.text(c, 'ENTER ROOM CODE', L.W / 2, y + (sm ? 20 : 34), UI.f('italic 900', sm ? 18 : 28, DFONT), '#ffd23c');
    const bs = sm ? 38 : 54, bx = L.W / 2 - (bs * 5 + 32) / 2, by = y + (sm ? 36 : 60);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = '#000'; UI.rr(c, bx + i * (bs + 8), by, bs, bs * 1.1, 6); c.fill(); c.strokeStyle = i === this.code.length ? '#fff' : '#4a5590'; c.lineWidth = 2; c.stroke();
      if (this.code[i]) UI.text(c, this.code[i], bx + i * (bs + 8) + bs / 2, by + bs * 0.58, UI.f(900, bs * 0.62, FONT), '#ffe27a');
    }
    const A = Net.ALPH, cols = L.W < 520 ? 8 : 12, kw = Math.min(46, (w - 20 - (cols - 1) * 4) / cols), kh = sm ? 32 : 40, gx = L.W / 2 - (cols * kw + (cols - 1) * 4) / 2, gy = by + bs * 1.1 + 12;
    for (let i = 0; i < A.length; i++) { const r = Math.floor(i / cols), cc = i % cols; UI.button(c, A[i], gx + cc * (kw + 4), gy + r * (kh + 4), kw, kh, () => this.add(A[i]), { focusable: false, size: sm ? 15 : 18 }); }
    const rows = Math.ceil(A.length / cols), yb = gy + rows * (kh + 4) + 6, bw = (w - 60) / 3, bh = sm ? 36 : 44;
    UI.button(c, 'DEL', x + 15, yb, bw, bh, () => this.del(), { focusable: false });
    UI.button(c, 'BACK', x + 30 + bw, yb, bw, bh, () => App.go('title'), { focusable: false });
    UI.button(c, 'JOIN!', x + 45 + bw * 2, yb, bw, bh, () => this.go(), { focusable: false, hot: this.code.length === 5 });
  },
};
const ErrorScreen = {
  msg: '', role: null, enter(o) { this.msg = (o && o.msg) || 'SOMETHING WENT WRONG.'; this.role = o && o.role; Sound.play('aww'); },
  update(dt, typed) { runAttract(dt); if (typed.some(e => e.code === 'Escape')) App.go('title'); UI.handleKeys(typed); },
  draw(c, dt) {
    const L = App.L; backdrop(c, dt);
    const w = Math.min(L.W - 24, 600), h = Math.min(L.H - 30, 300), x = L.W / 2 - w / 2, y = L.H / 2 - h / 2;
    panel(c, x, y, w, h, '#ff8a8a');
    UI.text(c, 'FLAG ON THE PLAY', L.W / 2, y + 40, UI.f('italic 900', L.small ? 22 : 30, DFONT), '#ff8a8a');
    para(c, this.msg, x + 30, y + 74, w - 60, UI.f(600, 16, FONT), '#fff', 22, 'center');
    const bw = (w - 50) / 2;
    UI.button(c, this.role === 'host' ? 'HOST AGAIN' : 'SEARCH AGAIN', x + 15, y + h - 62, bw, 46, () => { if (this.role === 'host') { Net.host(); App.go('hostwait'); } else { Net.joinAny(); App.go('connecting'); } });
    UI.button(c, 'MAIN MENU', x + 35 + bw, y + h - 62, bw, 46, () => App.go('title'));
  },
};

/* ---------------- the game screen ---------------- */
const GameScreen = {
  update(dt, typed) {
    const A = App, mode = A.mode;
    if ((mode === 'host' || mode === 'guest') && Net.st.status === 'error') { const m = Net.st.error; Net.leave(); A.startAttract(); A.go('error', { msg: m, role: mode }); return; }
    if (typed.some(e => e.code === 'KeyP' || (e.code === 'Escape' && !Track.st.locked && performance.now() - (A.unlockAt || 0) > 400))) { if (!(A.snap && A.snap.over)) { A.paused = !A.paused; Sound.play(A.paused ? 'back' : 'select'); } }
    if (typed.some(e => e.code === 'KeyM')) Sound.toggle();
    const S0 = A.snap;
    const picking = S0 && S0.ph === 'select', menuUp = A.paused || (S0 && S0.over);
    if (menuUp) UI.handleKeys(typed);
    // ---- the trackball -> a run command; buttons -> press counters
    const cmd = Track.command();
    let aP = Track.st.action > 0, bP = Track.st.alt > 0; Track.st.action = 0; Track.st.alt = 0;
    if (menuUp) { aP = bP = false; }
    if (picking && !A.paused && !(S0 && S0.over)) { this.selectInput(S0, typed, aP, bP); aP = bP = false; }
    const inp = { x: cmd.x, y: cmd.y, m: cmd.m, aP, bP };
    if (mode === 'guest') {
      if (aP) { A.press.ac++; A.press.tta = S0 && S0.ba != null ? +S0.ba.toFixed(3) : null; } if (bP) A.press.bc++; // tta: when I pressed, how long until the ball arrives ON MY SCREEN
      A.inT -= dt;
      if (picking && !A.wasPicking) Net.send({ t: 'i', x: 0, y: 0, m: 0, ac: A.press.ac, bc: A.press.bc });
      A.wasPicking = !!picking;
      if (!picking) { // stick + press counters: immediately on change, keep-alive every 50 ms
        const msg = { t: 'i', x: +cmd.x.toFixed(2), y: +cmd.y.toFixed(2), m: +cmd.m.toFixed(2), ac: A.press.ac, bc: A.press.bc }; if (A.press.tta != null) msg.tt = A.press.tta;
        const key = JSON.stringify(msg);
        if (key !== A.lastIn || A.inT <= 0) { A.lastIn = key; A.inT = 0.05; msg.n = ++A.iseq; Net.sendFast(msg); }
      }
      const S = guestSnapshot(); if (S) A.snap = predictOwn(S, cmd, dt);
      if (A.snap && A.snap.gid !== A.lastGid) { A.lastGid = A.snap.gid; A.lastEv = 0; A.rematchSent = false; A.prevPh = null; }
      if (A.snap && A.snap.ph !== 'select') A.guestPick = null;
    } else {
      const r = A.remote, inputs = mode === 'cpu' ? [inp, null] : [inp, r];
      // online: the guest sees the ball late (link + its smoothing buffer) and its press arrives late; give it that much slack
      if (mode === 'host' && Sim.G) Sim.G.lag = [0, clamp((Net.st.ping == null ? 80 : Net.st.ping) / 1000 + 0.06, 0.06, 0.35)];
      if (!(A.paused && mode === 'cpu')) {
        const ts = A.timeScale || 1;
        A.acc = Math.min(A.acc + dt * ts, 0.1 * ts);
        let first = true;
        while (A.acc >= STEP) {
          const ii = first ? inputs : inputs.map(i => i && Object.assign({}, i, { aP: false, bP: false }));
          if (A.paused) ii[0] = { x: 0, y: 0, m: 0, aP: false, bP: false };
          Sim.update(STEP, ii); A.acc -= STEP; first = false;
          if (A.autoplay) A.autoplay();
        }
        if (!first) { r.aP = false; r.bP = false; }
      }
      A.snap = Sim.snapshot();
      if (mode === 'host') {
        const G = Sim.G; A.bcastT -= dt;
        if (A.bcastT <= 0) { A.bcastT = 1 / 60 - 0.002; A.sseq++; Net.sendFast({ t: 's', n: A.sseq, s: A.snap }); }
        A.needT -= dt; // both sides locked: only now ask the guest for its call
        if (G.phase === 'select' && G.pend[1] && !G.picks[1] && G.picks[0] && A.needT <= 0) { A.needT = 0.5; Net.send({ t: 'need' }); }
      }
    }
    const S = A.snap; if (!S) return;
    // phase transitions
    if (S.ph !== A.prevPh) {
      if (S.ph === 'select') this.resetSelect(S);
      if (S.ph === 'presnap') { Track.stop(); Track.clearNav(); setTimeout(() => Sound.play('set'), 250); }
      if (S.ph === 'over') { Sound.cheer(0.9, 4); }
    }
    else if (S.ph === 'select' && !A.Sel.locked && A.Sel.offense !== (S.off === A.me)) this.resetSelect(S); // possession changed under the panel: rebuild the cards
    const snapCam = A.prevPh == null || (A.prevPh !== S.ph && S.ph === 'select' && Math.abs(Render.cam.tx - S.los) > 40);
    A.prevPh = S.ph;
    Render.follow(S, dt, snapCam, A.me);
    // events -> sound + effects
    for (const e of S.ev) if (e.s > A.lastEv) { A.lastEv = e.s; this.onEvent(e, S); }
    Sound.crowd(clamp(0.18 + S.ex * 0.75 + (S.ph === 'live' ? 0.08 : 0), 0, 1), dt);
    Sound.music(S.ph === 'live' ? 0.12 : S.over ? 0.9 : 0.4);
  },
  onEvent(e, S) {
    const n = e.n, R = Render, shake = v => { R.cam.shake = Math.max(R.cam.shake, v); };
    switch (n) {
      case 'pad': case 'shed': case 'grunt': Sound.play('pad'); break;
      case 'hit': case 'deflect': Sound.play('hit'); if (e.x != null) R.spawn('turf', e.x, e.y); shake(0.12); break;
      case 'tackle': Sound.play('tackle'); if (e.x != null) R.spawn('turf', e.x, e.y); shake(0.22); break;
      case 'bighit': Sound.play('bighit'); if (e.x != null) { R.spawn('turf', e.x, e.y); R.spawn('ring', e.x, e.y); } shake(0.6); break;
      case 'td': Sound.play('td'); R.spawn('fw'); setTimeout(() => R.spawn('fw'), 700); shake(0.35); break;
      case 'fg': Sound.play('fg'); R.spawn('fw'); break;
      case 'fumble': Sound.play('fumble'); Sound.play('bounce'); shake(0.3); break;
      case 'switch': if (e.t == null || e.t === App.me) { Sound.play('switch'); if (e.sel && e.i != null) R.selFlash(e.i); } break;
      case 'lunge': if (e.t === App.me && !e.cpu) { App.flash = { s: e.g, i: e.i, t0: performance.now() }; Sound.play(e.g === 'PERFECT' ? 'perfect' : 'lunge'); } else Sound.play('dive'); break;
      case 'int': Sound.play('catch'); Sound.play('int'); if (e.x != null) R.spawn('ring', e.x, e.y); shake(0.25); break;
      case 'handoff': Sound.play('pad'); break;
      case 'drop': Sound.play('aww'); break;
      case 'recover': Sound.play('pad'); Sound.cheer(0.6, 2); break;
      default: Sound.play(n);
    }
  },
  resetSelect(S) {
    const A = App, offense = S.off === A.me; A.Sel.flip = false;
    const list = offense ? OFFENSE.filter(p => p.id !== 'fg' || S.fgok) : DEFENSE.slice();
    const keep = A.Sel.list === list ? A.Sel.idx : 0;
    const lastId = A.Sel['last' + (offense ? 'O' : 'D')];
    let idx = lastId ? list.findIndex(p => p.id === lastId) : keep; if (idx < 0) idx = 0;
    if (offense && S.dn === 4) { const k = list.findIndex(p => p.id === (S.fgok ? 'fg' : 'punt')); if (k >= 0) idx = k; }
    A.Sel = Object.assign(A.Sel, { idx, locked: false, list, offense });
    Track.clearNav();
  },
  toggleFlip() { const Sel = App.Sel; if (Sel.locked) return; Sel.flip = !Sel.flip; Sound.play('flip'); },
  selectInput(S, typed, aP, bP) {
    const A = App, Sel = A.Sel; if (!Sel.list.length) this.resetSelect(S);
    if (Sel.locked || S.lk[A.me]) { Sel.locked = true; Track.clearNav(); return; }
    const n = Sel.list.length, cols = A.L.portrait ? 2 : Math.min(4, Math.ceil(n / 2));
    const mv = (dx, dy) => { let i = Sel.idx + dx + dy * cols; i = ((i % n) + n) % n; if (i !== Sel.idx) { Sel.idx = i; Sound.play('move'); } };
    let keyed = false;
    for (const e of typed) {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { mv(1, 0); keyed = true; } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { mv(-1, 0); keyed = true; }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { mv(0, 1); keyed = true; } else if (e.code === 'ArrowUp' || e.code === 'KeyW') { mv(0, -1); keyed = true; }
      else if (/^Digit[1-8]$/.test(e.code)) { const k = +e.code.slice(5) - 1; if (k < n) { Sel.idx = k; Sound.play('move'); } }
      else if (e.code === 'KeyF') this.toggleFlip();
    }
    if (bP) this.toggleFlip(); // Shift / X / right-click / blue button / gamepad B also flip while calling
    if (keyed || Track.st.kind === 'keys') { Track.stop(); Track.clearNav(); }
    else { const nv = Track.takeNav(0.16); if (nv.dx || nv.dy) mv(Math.sign(nv.dx), Math.sign(nv.dy)); }
    if (aP) this.lockSel();
  },
  lockSel() { const A = App; if (A.Sel.locked) return; const p = A.Sel.list[A.Sel.idx]; if (!p) return; A.Sel['last' + (A.Sel.offense ? 'O' : 'D')] = p.id; A.lockPick(p.id); },
  actionLabels(S) {
    const me = App.me, i = S.ctl[me], hasBall = S.b[3] === 0 && S.b[4] === i, off = S.off === me;
    if (S.ph === 'select') return ['LOCK IN', App.Sel.locked ? '' : 'FLIP'];
    if (S.ph === 'presnap') return off ? ['HIKE', ''] : ['NEXT MAN', ''];
    if (S.ph !== 'live') return ['', ''];
    if (hasBall) {
      const q = S.pl[i], qb = (i % 7) === 3 && off;
      if (qb && S.kind === 'pass' && !S.thrown && !S.crossed) return ['THROW', 'NEXT'];
      if (S.w && S.w[0] === i) return ['SPIN!', ''];
      return ['JUKE', ''];
    }
    const c = S.b[3] === 0 && S.b[4] >= 0 ? S.pl[S.b[4]] : null, mine = c && (S.b[4] < 7 ? 0 : 1) === me;
    if (c && !mine) { const q = S.pl[i]; return [Math.hypot(c[0] - q[0], c[1] - q[1]) < 3.4 ? 'DIVE!' : 'SWITCH', 'NEXT']; }
    if (S.b[3] === 1 && !off && S.ba != null && S.bt) { // pass in the air: grab the closest man, then play the ball
      const q = S.pl[i], dMe = Math.hypot(S.bt[0] - q[0], S.bt[1] - q[1]); let best = dMe;
      for (let k = (1 - S.off) * 7; k < (1 - S.off) * 7 + 7; k++) { const p = S.pl[k]; if (p[4] === 1) continue; best = Math.min(best, Math.hypot(S.bt[0] - p[0], S.bt[1] - p[1])); }
      return [best < dMe - 0.6 ? 'SWITCH' : dMe <= Sim.INT.reach ? 'PICK!' : 'PICK', 'NEXT'];
    }
    if (S.b[3] === 1 && !off) return ['SWITCH', 'NEXT'];
    return ['', ''];
  },
  draw(c, dt) {
    const A = App, S = A.snap, L = A.L;
    if (!S) { c.setTransform(DPR, 0, 0, DPR, 0, 0); c.fillStyle = '#05060c'; c.fillRect(0, 0, L.W, L.H); UI.text(c, 'WAITING FOR THE HOST\u2026', L.W / 2, L.H / 2, UI.f(800, 18, DFONT), '#fff'); return; }
    Render.draw(c, S, dt, A.me);
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (L.panel) this.drawPanel(c, L);
    UI.hud(c, S, L, A.me);
    UI.callsDraw(c, S, L);
    UI.wrapMeter(c, S, A.me);
    this.drawFlash(c, S);
    if (S.ph !== 'select') UI.bannerDraw(c, S, L, dt);
    const sideSel = A.touch && !L.panel && S.ph === 'select' && !S.over; // touch landscape: cards get the left side, LOCK IN stays on the right
    L.selBox = sideSel ? { l: L.safe.l + 8, r: L.act.cx - L.act.R * 1.3 } : null;
    if (S.ph === 'select' && !S.over) {
      const hint = A.touch ? 'TAP A PLAY, TAP AGAIN TO LOCK · FLIP MIRRORS IT' : 'ROLL OR ARROWS TO PICK · F / SHIFT FLIPS · CLICK / SPACE LOCKS IN';
      UI.selectPanel(c, S, L, A.Sel, A.me, { hint, onFlip: () => { if (!A.paused) this.toggleFlip(); }, onCard: k => { if (A.Sel.locked) return; if (A.Sel.idx === k && (A.touch || !Track.st.locked)) this.lockSel(); else { A.Sel.idx = k; Sound.play('move'); } } });
    }
    if (S.ph === 'presnap' && !A.paused) {
      const off = S.off === A.me, blink = Math.sin(performance.now() / 160) > -0.2;
      const s = off ? (A.touch ? 'TAP HIKE TO SNAP THE BALL' : 'CLICK OR PRESS SPACE TO HIKE') : 'GET SET\u2026 ' + (A.touch ? 'NEXT MAN' : 'SPACE') + ' PICKS YOUR DEFENDER';
      if (A.Sel.flip && A.Sel.locked) UI.text(c, 'YOUR CALL IS FLIPPED', L.W / 2, Math.round(L.field.y + L.field.h * 0.86 + (L.small ? 20 : 28)), UI.f(800, L.small ? 11 : 13, DFONT), '#c9d0ee');
      if (blink || !off) UI.text(c, s, L.W / 2, L.field.y + L.field.h * 0.86, UI.f('italic 900', L.small ? 15 : 22, DFONT), off ? '#ffe27a' : '#9fd0ff');
    }
    // controls
    const lab = this.actionLabels(S), show = !S.over && !A.paused && S.ph !== 'half';
    if (A.touch && show) {
      if (!sideSel) Render.drawTrackball(c, L.tb.cx, L.tb.cy, L.tb.R, {});
      this.drawButton(c, L.act, lab[0] || 'ACTION', btnDown.act, '#d8283c');
      if (lab[1]) this.drawButton(c, L.alt, lab[1], btnDown.alt, '#2e5fd0');
      else L.altHidden = true;
    } else if (!A.touch && show) {
      Render.drawTrackball(c, L.tb.cx, L.tb.cy, L.tb.R, {});
      const keyHint = Track.st.locked ? 'ESC RELEASES' : '';
      if (keyHint) UI.text(c, keyHint, L.tb.cx, L.tb.cy + L.tb.R * 1.6 + 2, UI.f(700, 10, DFONT), 'rgba(220,225,255,0.55)');
      if (lab[0] && S.ph === 'live') UI.text(c, 'CLICK / SPACE: ' + lab[0] + (lab[1] ? '   SHIFT / RIGHT-CLICK: ' + lab[1] : ''), Math.round(L.tb.cx + L.tb.R * 1.6), Math.round(L.tb.cy + 4), UI.f(800, 12, DFONT), 'rgba(235,240,255,0.8)', 'left');
      if (S.ph === 'live' && S.off !== A.me && S.ba != null) UI.text(c, 'PRESS AGAIN AS THE BALL ARRIVES TO LUNGE FOR A PICK', Math.round(L.tb.cx + L.tb.R * 1.6), Math.round(L.tb.cy + 22), UI.f(700, 11, DFONT), 'rgba(255,226,122,0.85)', 'left');
      const recent = performance.now() - (Track.src.wheel.last) < 4000 || Track.st.lastKind === 'keys' || Track.st.lastKind === 'pad';
      if (!Track.st.locked && !recent && S.ph !== 'over') this.lockPill(c, L);
    }
    if ((A.mode === 'host' || A.mode === 'guest') && Net.st.ping != null) { const p = Net.st.ping; UI.text(c, 'LINK ' + p + ' MS', L.W - L.safe.r - 120, L.safe.t + 26, UI.f(700, 11, DFONT), p < 80 ? '#7f8fd0' : p < 160 ? '#e0c050' : '#ff7070', 'right'); }
    if (S.over) this.drawOver(c, S, L);
    if (A.paused) this.drawPause(c, L);
    iconButtons(c);
  },
  /** the timing call on your lunge: PERFECT / EARLY / LATE, small and crisp above your man */
  drawFlash(c, S) {
    const F = App.flash; if (!F) return; const age = (performance.now() - F.t0) / 1000; if (age > 0.9 || !S.pl[F.i]) { App.flash = null; return; }
    const q = S.pl[F.i], p = Render.proj(q[0], q[1], 3.3), col = F.s === 'PERFECT' ? '#7cff7a' : '#ffb04a', sz = App.L.small ? 14 : 17;
    const x = Math.round(p[0]), y = Math.round(p[1] - 8 - Math.min(1, age * 6) * 6);
    c.save(); c.globalAlpha = age < 0.65 ? 1 : Math.max(0, 1 - (age - 0.65) / 0.25);
    c.font = UI.f('italic 900', sz, DFONT); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(F.s, x, y);
    c.fillStyle = col; c.fillText(F.s, x, y); c.restore();
  },
  drawPanel(c, L) {
    const p = L.panel, g = c.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, '#20232c'); g.addColorStop(0.06, '#14161d'); g.addColorStop(1, '#07080b');
    c.fillStyle = g; c.fillRect(p.x, p.y, p.w, p.h);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(p.x, p.y, p.w, 1);
    // brushed-metal cabinet plate with the screws
    for (const [sx, sy] of [[14, p.y + 14], [p.w - 14, p.y + 14]]) { c.fillStyle = '#3a3e48'; c.beginPath(); c.arc(sx, sy, 4, 0, 7); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx - 3, sy); c.lineTo(sx + 3, sy); c.stroke(); }
    UI.text(c, 'TRACKBALL', L.tb.cx, p.y + 16, UI.f(800, 10, DFONT), 'rgba(255,255,255,0.35)');
  },
  drawButton(c, B, label, down, col) {
    const r = B.R * (down ? 0.94 : 1);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(B.cx + 2, B.cy + 4, r * 1.12, 0, 7); c.fill();
    c.fillStyle = '#1a1c22'; c.beginPath(); c.arc(B.cx, B.cy, r * 1.12, 0, 7); c.fill();
    const g = c.createRadialGradient(B.cx - r * 0.3, B.cy - r * 0.4, r * 0.1, B.cx, B.cy, r);
    g.addColorStop(0, down ? '#ffffff' : '#ff9aa4'); g.addColorStop(0.35, col); g.addColorStop(1, '#300408');
    if (col === '#2e5fd0') { g.addColorStop(0, '#b0c8ff'); }
    c.fillStyle = g; c.beginPath(); c.arc(B.cx, B.cy, r, 0, 7); c.fill();
    const z = UI.fit(c, label, r * 1.7, 900, Math.min(18, r * 0.42), DFONT);
    UI.text(c, label, B.cx, B.cy + 1, UI.f(900, z, DFONT), '#fff');
  },
  lockPill(c, L) {
    const s = 'CLICK THE FIELD TO GRAB THE TRACKBALL  ·  OR TWO-FINGER SWIPE  ·  ESC LETS GO';
    c.font = UI.f(800, 13, DFONT); const w = c.measureText(s).width + 30, x = L.W / 2 - w / 2, y = L.H - L.safe.b - 44;
    c.fillStyle = 'rgba(0,0,0,0.72)'; UI.rr(c, x, y, w, 30, 15); c.fill(); c.strokeStyle = 'rgba(255,210,60,0.6)'; c.lineWidth = 1; c.stroke();
    UI.text(c, s, L.W / 2, y + 16, UI.f(800, 13, DFONT), '#ffe27a');
  },
  drawOver(c, S, L) {
    const A = App, w = Math.min(L.W - 24, 520), h = Math.min(L.H - 40, 250), x = L.W / 2 - w / 2, y = L.field.y + L.field.h * 0.62 - h / 2;
    panel(c, x, Math.max(L.safe.t + 40, y), w, h);
    const yy = Math.max(L.safe.t + 40, y);
    const res = S.sc[0] === S.sc[1] ? 'TIE GAME' : (S.sc[A.me] > S.sc[1 - A.me] ? 'YOU WIN!' : 'YOU LOSE');
    UI.text(c, res, L.W / 2, yy + 40, UI.f('italic 900', L.small ? 28 : 40, DFONT), res === 'YOU WIN!' ? '#7cff7a' : '#ffd23c');
    UI.text(c, 'XPRESS ' + S.sc[0] + '  \u2013  ' + S.sc[1] + ' OUTLAWS', L.W / 2, yy + 88, UI.f(800, L.small ? 17 : 22, DFONT), '#fff');
    const bw = (w - 50) / 2, by = yy + h - 64;
    if (A.mode === 'guest' && A.rematchSent) UI.text(c, 'WAITING FOR YOUR BUDDY\u2026', x + 15 + bw / 2, by + 23, UI.f(800, 14, DFONT), '#ffe27a');
    else UI.button(c, 'PLAY AGAIN', x + 15, by, bw, 46, () => A.rematch());
    UI.button(c, 'MAIN MENU', x + 35 + bw, by, bw, 46, () => A.quit());
  },
  drawPause(c, L) {
    const A = App; c.fillStyle = 'rgba(0,0,10,0.55)'; c.fillRect(0, 0, L.W, L.H);
    const w = Math.min(L.W - 24, 420), h = 300, x = L.W / 2 - w / 2, y = Math.max(L.safe.t + 10, L.H / 2 - h / 2);
    panel(c, x, y, w, h);
    UI.text(c, 'TIMEOUT', L.W / 2, y + 36, UI.f('italic 900', 30, DFONT), '#ffd23c');
    if (A.mode !== 'cpu') UI.text(c, 'ONLINE: THE CLOCK KEEPS RUNNING', L.W / 2, y + 64, UI.f(700, 12, DFONT), '#c9d0ee');
    const bw = w - 40, bh = 44;
    UI.button(c, A.touch ? 'RESUME' : 'RESUME (CLICK TO GRAB THE BALL)', x + 20, y + 84, bw, bh, () => { A.paused = false; if (!A.touch) Track.requestLock(); });
    UI.button(c, 'SOUND: ' + (Sound.on ? 'ON' : 'OFF'), x + 20, y + 84 + (bh + 10), bw, bh, () => Sound.toggle());
    UI.button(c, 'QUIT TO MENU', x + 20, y + 84 + 2 * (bh + 10), bw, bh, () => A.quit());
  },
};

const SCREENS = { title: Title, options: Options, howto: Howto, hostwait: HostWait, connecting: Connecting, code: CodeEntry, error: ErrorScreen, game: GameScreen };

/* ---------------- main loop ---------------- */
let last = performance.now(), slow = 0;
function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  Track.update(dt || 1 / 60);
  const typed = Track.takeTyped();
  if (typed.length) Sound.unlock();
  if (App.screen !== 'game') { Track.st.action = 0; Track.st.alt = 0; const nv = Track.takeNav(0.22); if (nv.dy) UI.handleKeys([{ code: nv.dy > 0 ? 'ArrowDown' : 'ArrowUp' }]); }
  try {
    SCREENS[App.screen].update(dt, typed);
    UI.beginFrame();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    SCREENS[App.screen].draw(ctx, dt);
  } catch (e) { console.error(e); }
  // adaptive effects quality (never resolution): drop grass detail / crowd animation on slow devices
  App.lastFrameMs += ((dt * 1000) - App.lastFrameMs) * 0.05;
  if (App.lastFrameMs > 21) { if (++slow > 90 && Render.quality.level > 0) { Render.quality.level--; slow = 0; } } else slow = 0;
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
App.touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
Track.init(canvas);
resize();
App.startAttract();
App.go('title');
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden && App.screen === 'game' && App.mode === 'cpu' && App.snap && !App.snap.over) App.paused = true; });

/* test hook (used by the Playwright tests; harmless in normal play) */
window.TBF = { App, Sim, Net, UI, Track, Render, Sound, GameScreen, get DPR() { return DPR; } };
