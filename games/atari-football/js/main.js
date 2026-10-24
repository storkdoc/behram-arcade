/* ==========================================================================
   ATARI FOOTBALL — main.js
   App state machine, main loop, game modes and the glue between input,
   simulation, networking, rendering and the screen.
     modes: 'cpu'  (you = BLUE vs the computer)
            'host' (two-player online, you = BLUE, simulates & broadcasts)
            'guest'(two-player online, you = GOLD, sends inputs & renders host state)
            'hot'  (hidden: same-screen 2-player, only with ?local=1 in the URL)
   Play-call secrecy: every screen renders Sim.snapshot(viewer), which strips
   the opponent's call until the snap; the host sends GOLD snapshot(1).
   ========================================================================== */
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
const buf = document.createElement('canvas'); buf.width = VW; buf.height = VH;
const bctx = buf.getContext('2d', { alpha: false });
const STEP = 1 / 120;

const App = {
  screen: 'title', mode: null, qLen: +localStorage.getItem('atarifb.qlen') || 180, touch: false,
  paused: false, view: { local: [true, false], hi: ['#ffffff', '#ffffff'] }, lastPick: [null, null], sentPick: false, rematchSent: false,
  snap: null, viewer: 0, guestPick: null, needT: 0, homageNext: null, gid: 0, lastEv: 0, lastGid: null, prevPh: null, acc: 0, bcastT: 0, sendT: 0,
  remote: { x: 0, y: 0, a: false, b: false, aP: false, bP: false, ac: 0, bc: 0 },
  guestBuf: [], press: { ac: 0, bc: 0 },
  // latency handling (online): host -> 60 Hz state on the unordered channel with sequence numbers;
  // guest -> adaptive interpolation delay (~1.5 broadcast intervals) + prediction of its own player
  sseq: 0, sentRoles: '', lastSeq: 0, lastRoles: null, lastAt: 0, iv: 1 / 60 * 1000, jit: 2, delay: 25, iseq: 0, lastIn: '', inT: 0, pred: null,
  ctl: { solo: new Input.Controller('solo', 0, true), p1: new Input.Controller('p1', 0, true), p2: new Input.Controller('p2', 1, false) },

  go(name, o) {
    const cur = SCREENS[this.screen]; if (cur && cur.exit) cur.exit();
    this.screen = name; const s = SCREENS[name]; if (s && s.enter) s.enter(o);
    document.documentElement.classList.toggle('ingame', name === 'game');
  },
  startGame(mode) {
    this.mode = mode; this.gid = Math.floor(Math.random() * 1e9); this.paused = false; this.lastPick = [null, null];
    this.sentPick = false; this.rematchSent = false; this.acc = 0; this.lastEv = 0; this.prevPh = null;
    const human = mode === 'cpu' ? [true, false] : [true, true];
    if (mode !== 'guest') Sim.newGame({ human, qLen: this.qLen });
    this.viewer = mode === 'hot' ? -1 : mode === 'guest' ? 1 : 0; this.guestPick = null;
    this.view = mode === 'hot' ? { local: [true, true], hi: ['#ffffff', '#ff80ff'], names: ['P1', 'P2'] }
      : mode === 'guest' ? { local: [false, true], hi: ['#ffffff', '#ffffff'] } : { local: [true, false], hi: ['#ffffff', '#ffffff'] };
    this.snap = mode === 'guest' ? null : Object.assign(Sim.snapshot(this.viewer), { gid: this.gid });
    this.go('game');
    Audio8.play('whistle');
  },
  pick(team, id) {
    if (this.mode === 'guest') { this.guestPick = id; Net.send({ t: 'lock' }); this.sentPick = true; Audio8.play('lock'); } // the id itself waits for the host's 'need'
    else Sim.pick(team, id);
  },
  rematch() {
    if (this.mode === 'guest') { Net.send({ t: 'rematch' }); this.rematchSent = true; return; }
    this.startGame(this.mode);
  },
  quit() { if (this.mode === 'host' || this.mode === 'guest') Net.leave(); this.mode = null; this.paused = false; this.go('title'); },
};

/* ---------------- networking glue ---------------- */
Net.onMessage = d => {
  if (Net.st.role === 'host') {
    if (d.t === 'hello') { App.remote.n = 0; return; }
    if (d.t === 'i') {
      const r = App.remote;
      if (d.n != null) { if (d.n <= (r.n || 0)) return; r.n = d.n; } // unordered channel: drop stale input
      r.x = clamp(+d.x || 0, -1, 1); r.y = clamp(+d.y || 0, -1, 1); r.a = !!d.a; r.b = !!d.b;
      if (d.ac !== r.ac) { r.ac = d.ac; r.aP = true; } if (d.bc !== r.bc) { r.bc = d.bc; r.bP = true; }
    } else if (d.t === 'lock' && App.mode === 'host' && Sim.G && Sim.G.phase === 'select') Sim.lockBlind(1);
    else if (d.t === 'pick' && App.mode === 'host' && Sim.G && Sim.G.phase === 'select' && Sim.G.pend[1] && Sim.G.picks[0] && typeof d.id === 'string') Sim.pick(1, d.id);
    else if (d.t === 'rematch' && App.mode === 'host' && Sim.G && Sim.G.over) App.startGame('host');
  } else if (Net.st.role === 'guest') {
    if (d.t === 'hello') { App.lastSeq = 0; App.guestBuf = []; App.pred = null; return; }
    if (d.t === 's' && d.s) {
      const A = App, at = performance.now();
      if (d.n != null) { if (d.n <= A.lastSeq) return; A.lastSeq = d.n; } // unordered channel: drop stale state
      if (d.s.roles) A.lastRoles = d.s.roles; else d.s.roles = A.lastRoles;
      if (A.lastAt) { const gap = Math.min(250, at - A.lastAt); A.iv += (gap - A.iv) * 0.08; A.jit += (Math.abs(gap - A.iv) - A.jit) * 0.08; }
      A.lastAt = at;
      A.delay = clamp(1.5 * A.iv + 2 * A.jit, 16, 120); // smallest buffer that stays smooth on this link
      A.guestBuf.push({ at, s: d.s }); if (A.guestBuf.length > 24) A.guestBuf.shift();
      if (App.screen === 'connecting') App.startGame('guest');
    } else if (d.t === 'need' && App.mode === 'guest' && App.guestPick && App.snap && App.snap.ph === 'select') Net.send({ t: 'pick', id: App.guestPick });
  }
};
function guestSnapshot() {
  const B = App.guestBuf; if (!B.length) return null;
  const rt = performance.now() - App.delay;
  for (let k = B.length - 1; k > 0; k--) {
    if (B[k - 1].at <= rt && B[k].at > rt) { const u = (rt - B[k - 1].at) / (B[k].at - B[k - 1].at); return Render.lerpSnap(B[k - 1].s, B[k].s, u); }
  }
  return B[B.length - 1].s;
}

/**
 * Guest-side prediction of the guest's OWN controlled player: it moves on this screen the instant the
 * stick moves (same speed / acceleration model as the host), and is pulled smoothly toward where the
 * host's newest state says it is, led by one round trip. Off whenever the host has it tackled, diving,
 * engaged in a block or not under free control - then the host state is shown as is.
 */
function predictOwn(S, stick, dt) {
  const A = App, B = A.guestBuf, L = B.length && B[B.length - 1].s, me = 1;
  const i = S.ctl[me];
  if (A.noPredict) return S; // test hook
  const ok = L && S.ph === 'live' && L.ph === 'live' && L.cs && L.cs[me] > 0 && L.ctl[me] === i && S.pl[i][5] === 0 && L.pl[i][5] === 0 && !A.paused;
  if (!ok) { A.pred = null; return S; }
  const srv = L.pl[i], spd = L.cs[me];
  let P = A.pred;
  if (!P || P.i !== i) P = A.pred = { i, x: srv[0], y: srv[1], vx: 0, vy: 0 };
  const m = Math.hypot(stick.x, stick.y), wx = m ? stick.x / m * spd : 0, wy = m ? stick.y / m * spd : 0;
  const acc = 60 * dt, dvx = wx - P.vx, dvy = wy - P.vy, dm = Math.hypot(dvx, dvy);
  if (dm <= acc) { P.vx = wx; P.vy = wy; } else { P.vx += dvx / dm * acc; P.vy += dvy / dm * acc; }
  P.x += P.vx * dt; P.y += P.vy * dt;
  const lead = clamp((Net.st.ping || 60) / 1000, 0, 0.25), tx = srv[0] + P.vx * lead, ty = srv[1] + P.vy * lead;
  const ex = tx - P.x, ey = ty - P.y;
  if (Math.hypot(ex, ey) > 4) { P.x = tx; P.y = ty; } else { const k = Math.min(1, dt * 6); P.x += ex * k; P.y += ey * k; }
  const o = Object.assign({}, S); o.pl = S.pl.slice();
  const q = S.pl[i]; o.pl[i] = [P.x, P.y, m ? (stick.x < 0 ? -1 : stick.x > 0 ? 1 : q[2]) : q[2], q[3], Math.hypot(P.vx, P.vy) > 0.4 ? 1 : 0, q[5]];
  if (S.b[4] === i && S.b[3] === 0) o.b = [P.x, P.y, S.b[2], S.b[3], S.b[4]];
  return o;
}

/* ---------------- the game screen ---------------- */
const GameScreen = {
  update(dt, menu, typed) {
    const A = App, mode = A.mode;
    if (typed.some(e => e.code === 'Escape' || e.code === 'KeyP') || Touch.takePause()) { if (!(A.snap && A.snap.over)) { A.paused = !A.paused; UI.Pause.sel = 0; Audio8.play(A.paused ? 'back' : 'select'); } }
    if ((mode === 'host' || mode === 'guest') && Net.st.status === 'error') { const m = Net.st.error; Net.leave(); A.mode = null; A.go('error', { msg: m, role: mode }); return; }
    const c = A.ctl;
    const p1 = c.p1.s, p2 = c.p2.s, solo = c.solo.s;
    const ctlFor = t => mode === 'hot' ? (t === 0 ? p1 : p2) : solo;
    if (A.paused) { UI.Pause.update(dt, solo); if (mode === 'cpu' || mode === 'hot') { this.after(dt); return; } }
    if (mode === 'guest') {
      // send stick + buttons (with press counters so no tap is lost)
      if (solo.aP) A.press.ac++; if (solo.bP) A.press.bc++;
      A.inT -= dt;
      const picking = A.snap && A.snap.ph === 'select'; // while calling plays, nothing about the cursor leaves this device
      if (picking && !A.wasPicking) Net.send({ t: 'i', x: 0, y: 0, a: false, b: false, ac: A.press.ac, bc: A.press.bc });
      A.wasPicking = picking;
      if (!picking) { // send immediately on any change, and a keep-alive copy every 50 ms
        const msg = { t: 'i', x: +solo.x.toFixed(2), y: +solo.y.toFixed(2), a: solo.a, b: solo.b, ac: A.press.ac, bc: A.press.bc }, key = JSON.stringify(msg);
        if (key !== A.lastIn || A.inT <= 0) { A.lastIn = key; A.inT = 0.05; msg.n = ++A.iseq; Net.sendFast(msg); }
      }
      const S = guestSnapshot(); if (S) A.snap = predictOwn(S, solo, dt);
      if (A.snap && A.snap.gid !== A.lastGid) { A.lastGid = A.snap.gid; A.lastEv = 0; A.lastPick = [null, null]; A.rematchSent = false; }
      if (A.snap && A.snap.ph !== 'select') { A.sentPick = false; A.guestPick = null; }
    } else {
      // local simulation (also the authoritative host)
      const S0 = A.snap;
      if (S0 && S0.ph === 'select' && !A.paused) UI.Select.update(dt, S0, ctlFor);
      const r = A.remote;
      const inputs = mode === 'cpu' ? [solo, null] : mode === 'hot' ? [p1, p2] : [solo, r];
      if (!(A.paused && mode !== 'host')) {
        const ts = A.timeScale || 1; // test hook: AFB.App.timeScale fast-forwards the simulation
        A.acc = Math.min(A.acc + dt * ts, 0.1 * ts);
        let first = true;
        while (A.acc >= STEP) {
          const inp = first ? inputs : inputs.map(i => i && Object.assign({}, i, { aP: false, bP: false }));
          if (S0 && S0.ph === 'select') { if (inp[0]) inp[0] = Object.assign({}, inp[0], { aP: false, bP: false }); if (inp[1]) inp[1] = Object.assign({}, inp[1], { aP: false, bP: false }); }
          Sim.update(STEP, inp); A.acc -= STEP; first = false;
        }
        if (!first) { r.aP = false; r.bP = false; }
      }
      A.snap = Object.assign(Sim.snapshot(A.viewer), { gid: A.gid });
      if (mode === 'host') {
        const G = Sim.G;
        A.bcastT -= dt;
        if (A.bcastT <= 0) { // ~60 Hz, GOLD's view (BLUE's call stripped), roles only when they change
          A.bcastT = 1 / 60 - 0.002;
          const s = Object.assign(Sim.snapshot(1), { gid: A.gid }), rk = s.roles.join();
          A.sseq++; if (rk === A.sentRoles && A.sseq % 60) delete s.roles; else A.sentRoles = rk;
          Net.sendFast({ t: 's', n: A.sseq, s });
        }
        // both sides locked: only now ask the guest for its call
        A.needT -= dt;
        if (G.phase === 'select' && G.pend[1] && !G.picks[1] && G.picks[0] && A.needT <= 0) { A.needT = 0.5; Net.send({ t: 'need' }); }
      }
    }
    const S = A.snap; if (!S) return;
    if (S.ph === 'select' && A.prevPh !== 'select') UI.Select.reset(S);
    if (S.ph === 'select' && mode === 'guest' && !A.paused) UI.Select.update(dt, S, ctlFor);
    if (S.over && !A.paused) UI.Over.update(dt, solo);
    const big = A.prevPh !== S.ph && (S.ph === 'kickset' || S.ph === 'select');
    A.prevPh = S.ph;
    Render.camera(S, dt, big && Math.abs(Field.cam.x - (S.b[0] - Field.viewW / 2)) > 30);
    this.after(dt);
  },
  /** sounds, music level, touch controls */
  after(dt) {
    const A = App, S = A.snap; if (!S) return;
    for (const e of S.ev) if (e.s > A.lastEv) { A.lastEv = e.s; Audio8.play(e.n); }
    Audio8.music(S.ph === 'live' ? 0.45 : S.over ? 1 : 0.8);
    const me = A.view.local[0] ? 0 : 1;
    const liveish = (S.ph === 'live' || S.ph === 'presnap' || S.ph === 'kickset' || S.ph === 'result') && !A.paused && !S.over;
    Touch.show(liveish && A.mode !== 'hot');
    if (liveish) {
      const ctlRole = S.roles[S.ctl[me]], hasBall = S.b[4] >= 0 && (S.b[4] < 7 ? 0 : 1) === me;
      let a = 'ACTION', b = 'CYCLE';
      if (S.mt && S.off === me && !S.mt[1]) a = 'KICK';
      else if (hasBall && ctlRole === 'QB' && S.kind === 'pass' && !S.thrown) { a = 'PASS'; b = 'TARGET'; }
      else if (hasBall && ctlRole === 'QB' && S.kind === 'run') a = 'PITCH';
      else if (hasBall) a = 'JUKE';
      else if (S.b[3] === 1 && S.bt && S.bt[2] === 'pass' && S.off === me) a = 'CATCH';
      else if (!hasBall) { a = 'TACKLE'; b = 'SWITCH'; }
      if (hasBall && (S.kind === 'kickoff' || S.kind === 'punt')) b = 'KNEEL';
      Touch.labels(a, b);
    }
  },
  draw(ctx) {
    const S = App.snap;
    if (!S) { Px.rect(ctx, 0, 0, VW, VH, '#000'); FONT.draw(ctx, 'WAITING FOR HOST...', VW / 2, VH / 2, '#fff', 1, 'c'); return; }
    Render.draw(ctx, S, App.view, 1 / 60);
    if (S.ph === 'select') UI.Select.draw(ctx, S);
    if (S.over) UI.Over.draw(ctx, S);
    if (App.paused) UI.Pause.draw(ctx);
    if ((App.mode === 'host' || App.mode === 'guest') && Net.st.ping != null) { const p = Net.st.ping; FONT.draw(ctx, 'LINK ' + p + 'MS', VW / 2, 13, p < 80 ? '#5060a0' : p < 160 ? '#c0a040' : '#ff6060', 1, 'c'); }
  },
};

const SCREENS = {
  title: UI.Title, howto: UI.Howto, homage: UI.Homage, hostLobby: UI.HostLobby, join: UI.Join,
  connecting: UI.Connecting, error: UI.ErrorScreen, game: GameScreen,
};

/* ---------------- crisp integer scaling ---------------- */
let scale = 1;
function resize() {
  const wrap = document.getElementById('wrap'), cs = getComputedStyle(wrap);
  const aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const dpr = window.devicePixelRatio || 1;
  let s = Math.floor(Math.min(aw * dpr / VW, ah * dpr / VH));
  if (s < 1) s = Math.max(0.5, Math.min(aw * dpr / VW, ah * dpr / VH));
  scale = s;
  canvas.width = Math.round(VW * s); canvas.height = Math.round(VH * s);
  canvas.style.width = (canvas.width / dpr) + 'px'; canvas.style.height = (canvas.height / dpr) + 'px';
  ctx.imageSmoothingEnabled = false;
  const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 640;
  document.documentElement.classList.toggle('portrait', portrait);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

/* ---------------- taps & clicks on the canvas ---------------- */
canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); Audio8.unlock();
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * VW, y = (e.clientY - r.top) / r.height * VH;
  UI.tap(x, y);
});

/* ---------------- main loop ---------------- */
let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  const typed = Input.takeTyped();
  const c = App.ctl; c.solo.update(dt); c.p1.update(dt); c.p2.update(dt);
  const scr = SCREENS[App.screen];
  if (App.screen !== 'game') Touch.show(false);
  scr.update(dt, c.solo.s, typed);
  Input.endFrame();
  UI.beginFrame();
  SCREENS[App.screen].draw(bctx);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
Touch.init();
App.touch = Touch.enabled;
resize();
App.go('title');
requestAnimationFrame(frame);

/* test hook (used by the Playwright tests; harmless in normal play) */
window.AFB = { App, Sim, Net, UI, Field, get scale() { return scale; } };
