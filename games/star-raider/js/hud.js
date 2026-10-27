/* ==========================================================================
   STAR RAIDER — hud.js : the crisp 2D layer over the 3D view (canvas 2D at
   device resolution): crosshairs, target brackets, attack computer with
   tracking bars, the control panel readouts (V K E T, θ Φ R), damage panel,
   messages and red alert, docking and hyperwarp guidance, the Galactic Chart
   and the Long-Range Scan.
   ========================================================================== */
const S = window.SRSim, V = S.V;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, '0');
const sgn = n => (n < 0 ? '-' : '+') + pad(Math.abs(n), 2);
const COL = { hud: '#7ff7ff', dim: 'rgba(127,247,255,0.45)', warn: '#ffd25a', bad: '#ff4a3a', good: '#7dff9a', enemy: '#ff4a6a', base: '#7fd8ff', buddy: '#9dff7a', mag: '#ff5ad2' };
const KCOL = { darter: '#ff4a6a', lancer: '#ff9a3a', hive: '#ff5ad2', rival: '#ffb040' };
const TEAMCOL = ['#6ab8ff', '#ffb040'];
export class Hud {
  constructor(canvas) { this.c = canvas; this.x = canvas.getContext('2d'); this.W = 1; this.H = 1; this.pr = 1; this.msgs = []; this.seenMsg = 0; this.alertT = 0; this.flashT = 0; this.chartHits = []; this.lrsGhost = []; this.galCache = null; this.galCacheT = -99; this.pops = []; this.barH = 0; this.font = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'; }
  resize(insets) {
    const pr = Math.min(2, devicePixelRatio || 1); this.pr = pr; this.W = innerWidth; this.H = innerHeight;
    this.c.width = Math.round(this.W * pr); this.c.height = Math.round(this.H * pr); this.c.style.width = this.W + 'px'; this.c.style.height = this.H + 'px';
    this.I = insets || { t: 0, r: 0, b: 0, l: 0 };
  }
  F(size, w = 700) { return `${w} ${Math.round(size)}px ${this.font}`; }
  text(t, x, y, size, col, align = 'left', glow = 0, w = 700) { const c = this.x; c.font = this.F(size, w); c.textAlign = align; c.fillStyle = col; if (glow) { c.shadowColor = col; c.shadowBlur = glow; } c.fillText(t, x, y); if (glow) c.shadowBlur = 0; }
  /* ---------- main entry ---------- */
  draw(st) {
    const c = this.x, W = this.W, H = this.H; c.setTransform(this.pr, 0, 0, this.pr, 0, 0); c.clearRect(0, 0, W, H);
    this.st = st; const me = st.me; if (!me) return;
    const port = H > W, sm = Math.min(W, H), u = clamp(sm / 70, 6.5, 13); this.u = u; this.port = port;
    const I = this.I;
    this.pullMsgs(st);
    if (st.view === 'chart') { if (st.war) this.warChart(st); else this.chart(st); this.messages(st, true); return; }
    if (st.view === 'lrs') { this.lrs(st); this.messages(st, true); this.panel(st); return; }
    if (!me.alive) { this.dead(st); this.messages(st); return; }
    if (me.warp) { this.warp(st); this.panel(st); return; }
    this.targets(st);
    this.drawPops(st);
    this.crosshair(st);
    this.objective(st);
    this.panel(st);
    this.attackComputer(st);
    this.dockGuide(st);
    this.messages(st);
    this.redAlert(st);
  }
  pullMsgs(st) {
    for (const m of st.msgs || []) { if (m.id <= this.seenMsg) continue; this.seenMsg = m.id;
      if (m.who === -2 && st.me.dmg.R >= 2) continue; // radio destroyed: no subspace reports
      if (m.who >= 0 && m.who !== st.me.idx) continue;
      this.msgs.push({ text: m.text, kind: m.kind, t: 0 }); if (this.msgs.length > 4) this.msgs.shift(); }
    for (const m of this.msgs) m.t += st.dt; this.msgs = this.msgs.filter(m => m.t < 6);
  }
  messages(st, top) {
    const u = this.u, W = this.W, y0 = this.I.t + u * (top ? 2.2 : 6.2);
    this.msgs.forEach((m, i) => { const a = clamp(6 - m.t, 0, 1), col = m.kind === 'alert' ? COL.bad : m.kind === 'warn' ? COL.warn : m.kind === 'good' ? COL.good : COL.hud;
      this.x.globalAlpha = a; this.text(m.text, W / 2, y0 + i * u * 1.9, u * 1.25, col, 'center', 8); this.x.globalAlpha = 1; });
  }
  redAlert(st) {
    if (this.alertT <= 0) return; this.alertT -= st.dt;
    const on = Math.floor(this.alertT * 4) % 2 === 0, u = this.u;
    if (on) this.text('RED ALERT', this.W / 2, this.I.t + u * 4.2, u * 2.6, COL.bad, 'center', 18, 900);
    const c = this.x, g = c.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,20,${on ? 0.28 : 0.1})`); c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
  }
  /** score pops: +pts floating up from where a kill happened */
  pop(pos, text, col) { this.pops.push({ pos, text, col: col || COL.warn, t: 0 }); if (this.pops.length > 8) this.pops.shift(); }
  drawPops(st) {
    const u = this.u;
    for (const p of this.pops) { p.t += st.dt; const q = st.R.project(p.pos, st.me); if (!q.on) continue; const a = clamp(1.6 - p.t, 0, 1), sc = 1 + Math.max(0, 0.25 - p.t) * 3;
      this.x.globalAlpha = a; this.text(p.text, q.x, q.y - p.t * u * 5, u * 1.6 * sc, p.col, 'center', 12, 900); this.x.globalAlpha = 1; }
    this.pops = this.pops.filter(p => p.t < 1.6);
  }
  /** a short-term goal line for the sector you are in */
  objective(st) {
    if (!st.obj || this.msgs.length) return;
    this.text(st.obj, this.W / 2, this.I.t + this.u * 6.2, this.u * 1.0, st.objCol || COL.dim, 'center', 4);
  }
  /* ---------- crosshair (fore: open cross, aft: diagonal) ---------- */
  crosshair(st) {
    const c = this.x, me = st.me, x = this.W / 2, y = this.H / 2, u = this.u, lock = me.lock;
    const col = lock ? COL.bad : COL.hud; c.strokeStyle = col; c.lineWidth = Math.max(1.5, u * 0.18); c.shadowColor = col; c.shadowBlur = 8;
    const r0 = u * 1.2, r1 = u * 3.4; c.beginPath();
    if (me.view === 'aft') { for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { c.moveTo(x + dx * r0 * 0.7, y + dy * r0 * 0.7); c.lineTo(x + dx * r1 * 0.7, y + dy * r1 * 0.7); } }
    else { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(x + dx * r0, y + dy * r0); c.lineTo(x + dx * r1, y + dy * r1); } }
    c.stroke();
    if (lock) { const t = st.t * 6; c.beginPath(); c.arc(x, y, u * 4.4 + Math.sin(t) * u * 0.3, 0, Math.PI * 2); c.stroke(); this.text('LOCKED', x, y + u * 6.4, u * 1.15, COL.bad, 'center', 10); }
    c.shadowBlur = 0;
    if (me.view === 'aft') this.text('AFT VIEW', x, y - u * 5.2, u * 1.1, COL.dim, 'center');
    if (me.track) this.text('TRACKING', x, y - u * (me.view === 'aft' ? 6.8 : 5.2), u * 1.0, COL.warn, 'center');
  }
  /* ---------- brackets on every enemy, details on the target, off-screen arrow ---------- */
  targets(st) {
    const c = this.x, me = st.me, u = this.u, R = st.R;
    const tg = st.ships.find(s => s.id === me.targetId);
    for (const s of st.ships) {
      const p = R.project(s.pos, me), d = V.dist(s.pos, me.pos);
      if (!p.on) continue;
      const sz = clamp(S.KIND[s.kind].r * 900 / Math.max(10, d), u * 1.2, u * 9), isT = s === tg;
      c.strokeStyle = isT ? (me.lock ? COL.bad : COL.warn) : 'rgba(255,90,110,0.55)'; c.lineWidth = isT ? 2 : 1.2;
      const k = sz * 0.35; c.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const bx = p.x + sx * sz, by = p.y + sy * sz; c.moveTo(bx, by - sy * -k * 0 - sy * k * -1 * 0 + (sy < 0 ? k : -k)); c.lineTo(bx, by); c.lineTo(bx + (sx < 0 ? k : -k), by); }
      c.stroke();
      if (isT) { this.text(S.KIND[s.kind].name + ' ' + Math.round(d), p.x, p.y - sz - u * 0.6, u * 0.95, c.strokeStyle, 'center');
        if (s.kind === 'hive' && s.sh > 0.5) this.text('SHIELD ' + '■'.repeat(Math.ceil(s.sh)), p.x, p.y + sz + u * 1.4, u * 0.85, COL.mag, 'center'); }
    }
    // off-screen pointer toward the target
    if (tg) { const p = R.project(tg.pos, me); if (!p.on) { const a = Math.atan2(-p.vy, p.vx), r = Math.min(this.W, this.H) * 0.36, x = this.W / 2 + Math.cos(a) * r, y = this.H / 2 + Math.sin(a) * r;
      c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = p.behind ? COL.bad : COL.warn; c.beginPath(); c.moveTo(u * 1.6, 0); c.lineTo(-u * 0.8, u * 0.9); c.lineTo(-u * 0.8, -u * 0.9); c.fill(); c.restore();
      if (p.behind && me.view === 'fore') this.text('BEHIND · A FOR AFT', x, y + u * 2, u * 0.85, COL.bad, 'center'); } }
    // incoming plasma warning arrows (close shots)
    for (const sh of st.shots) { if (sh.kind !== 'plasma') continue; const d = V.dist(sh.pos, me.pos); if (d > 90) continue; const p = R.project(sh.pos, me); if (p.on) { c.strokeStyle = 'rgba(255,90,200,0.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, u * (0.8 + 40 / Math.max(5, d)), 0, Math.PI * 2); c.stroke(); } }
  }
  /* ---------- control panel: V K E T and θ Φ R, throttle, damage, shields ---------- */
  panel(st) {
    const c = this.x, me = st.me, u = this.u, W = this.W, H = this.H, I = this.I, port = this.port;
    const sk = S.key(me.sx, me.sy), foes = st.ships.length;
    const fs = u * (port ? 1.2 : 1.35);
    const line1 = `V:${pad(S.SPEED[Math.min(me.thr, S.thrCap(me))], 2)}  K:${pad(me.kills, 2)}  E:${pad(me.energy, 4)}  T:${foes}`;
    // top-left: the classic readout line
    const x0 = I.l + u * 1.2, y0 = I.t + u * 2.2;
    this.text(line1, x0, y0, fs, me.energy < 1500 ? COL.warn : COL.hud, 'left', 6);
    // top-right: sector, shields, computer
    const xr = W - I.r - u * 1.2;
    this.text(`SECTOR ${me.sx},${me.sy}`, xr, y0, fs * 0.85, COL.hud, 'right', 4);
    const shOn = me.shields && me.dmg.S < 2;
    this.text(shOn ? (me.dmg.S ? 'SHIELDS FLICKERING' : 'SHIELDS UP') : 'SHIELDS DOWN', xr, y0 + u * 1.7, fs * 0.8, shOn ? (me.dmg.S ? COL.warn : COL.good) : COL.bad, 'right', 4);
    this.text(me.comp && me.dmg.C < 2 ? 'ATTACK COMPUTER ON' : 'ATTACK COMPUTER OFF', xr, y0 + u * 3.2, fs * 0.7, me.comp && me.dmg.C < 2 ? COL.dim : COL.warn, 'right');
    // damage panel: P E S C L R
    const dx = I.l + u * 1.2; let dy = y0 + u * 1.9;
    c.font = this.F(fs * 0.95, 800); c.textAlign = 'left';
    S.SYS.forEach((k, i) => { const l = me.dmg[k], col = l === 0 ? COL.good : l === 1 ? COL.warn : COL.bad; const blink = l === 2 ? (Math.floor(st.t * 3) % 2 ? 0.35 : 1) : 1; c.globalAlpha = blink; c.fillStyle = col; c.fillText(k, dx + i * fs * 0.95, dy); c.globalAlpha = 1; });
    // energy bar
    const bw = Math.min(W * 0.3, u * 18), by = dy + u * 0.9; c.fillStyle = 'rgba(127,247,255,0.15)'; c.fillRect(dx, by, bw, u * 0.5); const ef = clamp(me.energy / (me.emax || 9999), 0, 1); c.fillStyle = ef < 0.15 ? COL.bad : ef < 0.35 ? COL.warn : COL.hud; c.fillRect(dx, by, bw * ef, u * 0.5);
    // throttle ladder (desktop / non-touch); touch has its own slider
    if (!st.touch) { const tx = I.l + u * 1.4, ty = H * 0.62, th = H * 0.22, cap = S.thrCap(me);
      for (let i = 0; i <= 9; i++) { const yy = ty + th - (i / 9) * th; c.fillStyle = i <= me.thr ? (i > cap ? COL.bad : COL.hud) : 'rgba(127,247,255,0.15)'; c.fillRect(tx, yy - u * 0.35, u * (1.2 + i * 0.12), u * 0.5); }
      this.text('THR ' + me.thr, tx, ty + th + u * 1.6, u * 0.95, COL.hud); }
  }
  /* ---------- attack computer: tracking bars, lock lights A B C, θ Φ R ---------- */
  attackComputer(st) {
    const c = this.x, me = st.me, u = this.u, W = this.W, H = this.H, I = this.I;
    const on = me.comp && me.dmg.C < 2; if (!on) return;
    const size = clamp(Math.min(W, H) * (this.port ? 0.2 : 0.17), 70, 170);
    let cx, cy;
    if (st.touch) { cx = this.port ? W - I.r - size * 0.62 : W / 2; cy = this.port ? I.t + size * 1.25 + u * 3 : H - I.b - size * 0.62; }
    else { cx = W / 2; cy = st.consoleTop * H + (H - st.consoleTop * H) * 0.5; if (H - st.consoleTop * H < size * 1.1) cy = H - I.b - size * 0.62; }
    const x0 = cx - size / 2, y0 = cy - size / 2;
    c.fillStyle = 'rgba(0,18,24,0.72)'; c.fillRect(x0, y0, size, size); c.strokeStyle = COL.dim; c.lineWidth = 1; c.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);
    c.beginPath(); c.moveTo(cx, y0 + 4); c.lineTo(cx, y0 + size - 4); c.moveTo(x0 + 4, cy); c.lineTo(x0 + size - 4, cy); c.strokeStyle = 'rgba(127,247,255,0.18)'; c.stroke();
    c.strokeStyle = 'rgba(127,247,255,0.35)'; c.strokeRect(cx - size * 0.12, cy - size * 0.12, size * 0.24, size * 0.24);
    const tg = st.ships.find(s => s.id === me.targetId); const glitch = me.dmg.C === 1 && Math.random() < 0.35;
    let th = 0, ph = 0, rr = 0;
    if (tg && !glitch) {
      const q = me.q, inv = [-q[0], -q[1], -q[2], q[3]]; let l = S.Q.rot(inv, V.sub(tg.pos, me.pos)); if (me.view === 'aft') l = [-l[0], l[1], -l[2]];
      const d = V.len(l); th = Math.atan2(l[0], -l[2]) * 180 / Math.PI; ph = Math.atan2(l[1], Math.hypot(l[0], l[2])) * 180 / Math.PI; rr = d;
      const bx = cx + clamp(th / 45, -1, 1) * size * 0.46, by = cy - clamp(ph / 45, -1, 1) * size * 0.46;
      const A = Math.abs(th) < 4.3, B = Math.abs(ph) < 4.3, Cc = d < 240;
      c.strokeStyle = A ? COL.bad : COL.hud; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, y0 + 3); c.lineTo(bx, y0 + size - 3); c.stroke();
      c.strokeStyle = B ? COL.bad : COL.hud; c.beginPath(); c.moveTo(x0 + 3, by); c.lineTo(x0 + size - 3, by); c.stroke();
      c.fillStyle = KCOL[tg.kind]; c.shadowColor = c.fillStyle; c.shadowBlur = 8; c.fillRect(bx - 3, by - 3, 6, 6); c.shadowBlur = 0;
      const ly = y0 - u * 0.7; ['A', 'B', 'C'].forEach((k, i) => { const v = [A, B, Cc][i]; this.text(k, x0 + size * (0.2 + i * 0.3), ly, u * 1.1, v ? COL.bad : 'rgba(127,247,255,0.3)', 'center', v ? 8 : 0, 900); });
    }
    if (me.dmg.C === 1) this.text('COMPUTER DAMAGED', cx, y0 + size + u * 1.3, u * 0.8, COL.warn, 'center');
    this.text(`θ:${sgn(th)} Φ:${sgn(ph)} R:${tg ? '+' + pad(rr, 3) : '+000'}`, cx, y0 + size + u * (me.dmg.C === 1 ? 2.6 : 1.4), u * 1.0, COL.hud, 'center', 4);
  }
  /* ---------- docking guidance ---------- */
  dockGuide(st) {
    const me = st.me, u = this.u; if (!st.base) return;
    const p = st.R.project(S.BASE_POS, me), d = V.dist(S.BASE_POS, me.pos), c = this.x;
    if (p.on && !me.dock) { c.strokeStyle = COL.base; c.lineWidth = 1.5; c.setLineDash([4, 4]); c.beginPath(); c.arc(p.x, p.y, u * 3, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); this.text('STARBASE ' + Math.round(d), p.x, p.y - u * 3.6, u * 0.95, COL.base, 'center'); }
    const y = this.H * 0.5 + u * (st.touch && this.port ? 9 : 9.5);
    if (me.dock) {
      const D = me.dock, tx = D.phase === 'orbit' ? 'ORBIT ESTABLISHED' : D.phase === 'drone' ? (D.t < 1.8 ? 'REPAIR DRONE LAUNCHED' : 'TRANSFERRING ENERGY · REPAIRING') : 'TRANSFER COMPLETE';
      this.text(tx, this.W / 2, y, u * 1.4, COL.good, 'center', 10);
      if (D.phase === 'drone') { const k = clamp(D.t / 5.5, 0, 1), bw = u * 18; c.fillStyle = 'rgba(125,255,154,0.2)'; c.fillRect(this.W / 2 - bw / 2, y + u, bw, u * 0.6); c.fillStyle = COL.good; c.fillRect(this.W / 2 - bw / 2, y + u, bw * k, u * 0.6); }
      return;
    }
    if (d < 400) { const al = me.canDock; this.text(al ? 'ALIGNED · THROTTLE 0 TO DOCK' + (st.touch ? '' : ' (KEY 0)') : d < 95 ? 'CENTER THE STARBASE TO DOCK' : 'APPROACH THE STARBASE · ENTER = AUTO-APPROACH', this.W / 2, y, u * 1.05, al ? COL.good : COL.base, 'center', 6); }
  }
  /* ---------- hyperwarp ---------- */
  warp(st) {
    const me = st.me, w = me.warp, u = this.u, c = this.x, W = this.W, H = this.H;
    if (w.phase === 'spool') { this.text('HYPERWARP ENGAGED', W / 2, H * 0.3, u * 1.8, COL.hud, 'center', 14); this.text(`DESTINATION ${w.tx},${w.ty}`, W / 2, H * 0.3 + u * 2.4, u * 1.1, COL.dim, 'center'); return; }
    if (w.phase === 'tunnel') {
      const drift = st.drift > 0, R = Math.min(W, H) * 0.32, mx = W / 2 + w.m[0] * R, my = H / 2 - w.m[1] * R;
      c.strokeStyle = COL.dim; c.lineWidth = 1.5; c.beginPath(); c.arc(W / 2, H / 2, R * 0.22, 0, Math.PI * 2); c.stroke();
      const e = Math.hypot(w.m[0], w.m[1]), ok = e < 0.22, col = ok ? COL.good : e < 0.5 ? COL.warn : COL.bad;
      c.strokeStyle = col; c.lineWidth = 2.5; c.shadowColor = col; c.shadowBlur = 12; c.beginPath(); c.moveTo(mx, my - u * 1.8); c.lineTo(mx + u * 1.8, my); c.lineTo(mx, my + u * 1.8); c.lineTo(mx - u * 1.8, my); c.closePath(); c.stroke(); c.shadowBlur = 0;
      this.text(drift ? 'KEEP THE TARGET MARKER CENTERED' : 'HYPERWARP', W / 2, H * 0.18, u * 1.35, COL.hud, 'center', 8);
      this.text(`DEST ${w.tx},${w.ty} · ETA ${Math.max(0, w.dur - w.t).toFixed(1)}`, W / 2, H * 0.18 + u * 2, u * 1.0, COL.dim, 'center');
      if (!ok) this.text('OFF COURSE', W / 2, H * 0.82, u * 1.3, col, 'center', 8);
      return;
    }
    const L = w.land; if (L) { const off = L[0] !== w.tx || L[1] !== w.ty; this.text(off ? `OFF COURSE · ARRIVED ${L[0]},${L[1]}` : `ARRIVED SECTOR ${L[0]},${L[1]}`, W / 2, H * 0.3, u * 1.6, off ? COL.warn : COL.good, 'center', 10); }
  }
  dead(st) {
    const me = st.me, u = this.u;
    this.text('SHIP DESTROYED', this.W / 2, this.H * 0.42, u * 2.6, COL.bad, 'center', 16, 900);
    if (me.respawn > 0) this.text('NEW SHIP IN ' + Math.ceil(me.respawn), this.W / 2, this.H * 0.42 + u * 3, u * 1.3, COL.hud, 'center');
  }
  /* ---------- the Galactic Chart ---------- */
  chartRect() {
    const I = this.I, W = this.W, H = this.H, u = this.u, top = I.t + u * 5 + (this.st && this.st.war ? this.barH : 0), bot = H - I.b - u * (this.st && this.st.touch ? (this.port ? 13 : 3) : 7.5);
    const left = I.l + u * 1.5 + (this.st && this.st.touch && !this.port ? u * 0 : 0), right = W - I.r - u * 1.5 - (this.st && this.st.touch && !this.port ? Math.min(W * 0.38, 300) : 0);
    const cw = Math.min((right - left) / S.W, (bot - top) / S.H), gw = cw * S.W, gh = cw * S.H;
    return { x: left + (right - left - gw) / 2, y: top + (bot - top - gh) / 2, cw, gw, gh };
  }
  chartHit(px, py) { const r = this.chartRect(); const x = Math.floor((px - r.x) / r.cw), y = Math.floor((py - r.y) / r.cw); if (x < 0 || y < 0 || x >= S.W || y >= S.H) return null; return [x, y]; }
  chart(st) {
    const c = this.x, me = st.me, u = this.u, W = this.W, H = this.H;
    c.fillStyle = 'rgba(2,6,14,0.82)'; c.fillRect(0, 0, W, H);
    // radio damage: stale or frozen intel
    let gal = st.gal;
    if (me.dmg.R >= 1) { const every = me.dmg.R >= 2 ? 1e9 : 8; if (!this.galCache || st.t - this.galCacheT > every) { this.galCache = JSON.parse(JSON.stringify(gal)); this.galCacheT = st.t; } gal = this.galCache; } else this.galCache = null;
    const r = this.chartRect(), cw = r.cw;
    this.text('GALACTIC CHART', W / 2, this.I.t + u * 2.4, u * 1.6, COL.hud, 'center', 10, 900);
    const fleets = gal.fleets, nShips = fleets.reduce((a, f) => a + f.d + f.l + f.h, 0);
    this.text(`STAR DATE ${(st.t / 6).toFixed(1)} · VRELL FLEETS ${fleets.length} (${nShips} SHIPS) · STARBASES ${gal.bases.filter(b => b.alive).length}`, W / 2, this.I.t + u * 4, u * 0.95, COL.dim, 'center');
    // grid
    c.strokeStyle = 'rgba(127,247,255,0.13)'; c.lineWidth = 1; c.beginPath();
    for (let i = 0; i <= S.W; i++) { c.moveTo(r.x + i * cw + 0.5, r.y); c.lineTo(r.x + i * cw + 0.5, r.y + r.gh); }
    for (let j = 0; j <= S.H; j++) { c.moveTo(r.x, r.y + j * cw + 0.5); c.lineTo(r.x + r.gw, r.y + j * cw + 0.5); }
    c.stroke();
    const ctr = (x, y) => [r.x + (x + 0.5) * cw, r.y + (y + 0.5) * cw];
    // starbases + siege state
    for (const b of gal.bases) { const [x, y] = ctr(b.x, b.y);
      if (!b.alive) { this.text('✕', x, y + cw * 0.15, cw * 0.45, 'rgba(255,74,58,0.6)', 'center'); continue; }
      c.save(); c.translate(x, y); c.rotate(st.t * 0.5); c.strokeStyle = COL.base; c.lineWidth = 2; c.shadowColor = COL.base; c.shadowBlur = 10; c.beginPath(); c.moveTo(0, -cw * 0.28); c.lineTo(cw * 0.28, 0); c.lineTo(0, cw * 0.28); c.lineTo(-cw * 0.28, 0); c.closePath(); c.stroke(); c.restore(); c.shadowBlur = 0;
      c.fillStyle = COL.base; c.beginPath(); c.arc(x, y, cw * 0.07, 0, 7); c.fill();
      if (b.siege > 0) { const k = clamp(b.siege / st.siegeMax, 0, 1); c.strokeStyle = COL.bad; c.lineWidth = 3; c.beginPath(); c.arc(x, y, cw * 0.4, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke(); if (Math.floor(st.t * 3) % 2) this.text('SIEGE', x, y - cw * 0.48, u * 0.8, COL.bad, 'center'); }
      if (b.siege > 0 || fleets.some(f => Math.abs(f.x - b.x) + Math.abs(f.y - b.y) <= 2)) for (const [sx, sy] of S.siegeSlots(b)) { const [qx, qy] = ctr(sx, sy); c.fillStyle = 'rgba(127,216,255,0.06)'; c.fillRect(qx - cw / 2 + 1, qy - cw / 2 + 1, cw - 2, cw - 2); }
    }
    // fleets (animated between sectors), intent arrows if the computer is working
    for (const f of fleets) {
      const k = clamp(f.mt, 0, 1), e = k * k * (3 - 2 * k), fx = f.px + (f.x - f.px) * e, fy = f.py + (f.y - f.py) * e; const [x, y] = ctr(fx, fy);
      if (f.goal && me.dmg.C < 2 && (f.goal[0] !== f.x || f.goal[1] !== f.y)) { const [gx, gy] = ctr(f.goal[0], f.goal[1]); c.strokeStyle = f.role === 'hunter' ? 'rgba(255,210,90,0.45)' : 'rgba(255,74,106,0.35)'; c.setLineDash([3, 5]); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(gx, gy); c.stroke(); c.setLineDash([]); }
      const col = f.h ? COL.mag : f.l ? '#ff9a3a' : COL.enemy; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 8;
      if (f.h) { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5; c.lineTo(x + Math.cos(a) * cw * 0.26, y + Math.sin(a) * cw * 0.26); } c.closePath(); c.fill(); }
      else { c.beginPath(); c.moveTo(x, y - cw * 0.24); c.lineTo(x + cw * 0.22, y + cw * 0.18); c.lineTo(x, y + cw * 0.06); c.lineTo(x - cw * 0.22, y + cw * 0.18); c.closePath(); c.fill(); }
      c.shadowBlur = 0; this.text(String(f.d + f.l + f.h), x + cw * 0.3, y + cw * 0.38, cw * 0.26, '#fff', 'center');
      if (f.role === 'hunter') this.text('H', x - cw * 0.32, y - cw * 0.22, cw * 0.2, COL.warn, 'center');
    }
    // players
    const blink = Math.floor(st.t * 2.5) % 2 === 0;
    if (st.buddyCell) { const [x, y] = ctr(st.buddyCell[0], st.buddyCell[1]); c.strokeStyle = COL.buddy; c.lineWidth = 2; c.beginPath(); c.arc(x, y, cw * 0.36, 0, 7); c.stroke(); this.text('P' + (st.buddyIdx + 1), x, y - cw * 0.42, u * 0.8, COL.buddy, 'center'); }
    { const [x, y] = ctr(me.sx, me.sy); if (blink || me.warp) { c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 10; c.beginPath(); c.arc(x, y, cw * 0.11, 0, 7); c.fill(); c.shadowBlur = 0; } c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, cw * 0.2, 0, 7); c.stroke(); }
    // cursor
    const cu = st.cursor; if (cu) { const [x, y] = ctr(cu[0], cu[1]), h = cw * 0.5; c.strokeStyle = COL.warn; c.lineWidth = 2.5; c.shadowColor = COL.warn; c.shadowBlur = 10; c.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(x + sx * h, y + sy * h * 0.45); c.lineTo(x + sx * h, y + sy * h); c.lineTo(x + sx * h * 0.45, y + sy * h); } c.stroke(); c.shadowBlur = 0;
      const [mx, my] = ctr(me.sx, me.sy); c.strokeStyle = 'rgba(255,210,90,0.5)'; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(mx, my); c.lineTo(x, y); c.stroke(); c.setLineDash([]);
      // info line
      const wc = S.warpCost(st.G || { R: Math.random }, me, cu[0], cu[1]); const f = fleets.find(f => f.x === cu[0] && f.y === cu[1]), b = gal.bases.find(b => b.alive && b.x === cu[0] && b.y === cu[1]);
      const what = f ? `VRELL FLEET: ${f.d ? f.d + ' DARTER' + (f.d > 1 ? 'S ' : ' ') : ''}${f.l ? f.l + ' LANCER' + (f.l > 1 ? 'S ' : ' ') : ''}${f.h ? f.h + ' HIVE' : ''}${f.role === 'hunter' ? ' (HUNTING YOU)' : ''}` : b ? 'STARBASE' + (b.siege > 0 ? ' · UNDER SIEGE' : '') : cu[0] === me.sx && cu[1] === me.sy ? 'YOUR SECTOR' : 'EMPTY SPACE';
      const iy = r.y + r.gh + u * 1.9;
      this.text(`TARGET ${cu[0]},${cu[1]} · ${what}`, W / 2, iy, u * 1.05, f ? COL.enemy : b ? COL.base : COL.hud, 'center', 4);
      const can = !(cu[0] === me.sx && cu[1] === me.sy), enough = me.energy > wc.e + 50, eng = me.dmg.E < 2;
      this.text(can ? `DISTANCE ${wc.d.toFixed(1)} · WARP ENERGY ${wc.e}${!enough ? ' · NOT ENOUGH ENERGY' : !eng ? ' · ENGINES DESTROYED' : st.touch ? ' · TAP WARP' : ' · H OR ENTER TO HYPERWARP'}` : 'PICK A SECTOR TO HYPERWARP TO', W / 2, iy + u * 1.6, u * 0.95, can && enough && eng ? COL.warn : COL.dim, 'center');
    }
    if (me.dmg.R >= 1) this.text(me.dmg.R >= 2 ? 'SUBSPACE RADIO DESTROYED · CHART FROZEN' : 'RADIO DAMAGED · CHART UPDATES DELAYED', W / 2, r.y - u * 0.6, u * 0.9, me.dmg.R >= 2 ? COL.bad : COL.warn, 'center');
    if (!st.touch) this.text('ARROWS MOVE THE CURSOR · CLICK A SECTOR · H HYPERWARP · F BACK TO THE VIEW', W / 2, H - this.I.b - u * 1.2, u * 0.85, COL.dim, 'center');
    // legend
    const lx = r.x, ly = r.y + r.gh + u * 4.8;
    if (!this.port || !st.touch) this.text('◆ STARBASE   ▲ DARTERS   ▲ LANCER FLEET   ⬢ HIVE FLEET   H HUNTER   ○ YOU', W / 2, ly, u * 0.8, COL.dim, 'center');
  }
  /* ---------- GALACTIC WAR chart: fog of war, squadrons, orders ---------- */
  warChart(st) {
    const c = this.x, me = st.me, u = this.u, W = this.W, H = this.H, v = st.war, mine = TEAMCOL[v.team], theirs = TEAMCOL[1 - v.team];
    c.fillStyle = 'rgba(2,6,14,0.86)'; c.fillRect(0, 0, W, H);
    const r = this.chartRect(), cw = r.cw, ctr = (x, y) => [r.x + (x + 0.5) * cw, r.y + (y + 0.5) * cw];
    this.text('GALACTIC WAR · ' + (v.team ? 'GOLD' : 'BLUE') + ' COMMAND', W / 2, this.I.t + u * 2.4, u * 1.5, mine, 'center', 10, 900);
    // fog: visible sectors are lit, the rest is dark; nebula purple
    const vis = new Set(v.vis), neb = new Set(v.nebula);
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) { const k = S.key(x, y), X = r.x + x * cw, Y = r.y + y * cw;
      if (neb.has(k)) { c.fillStyle = 'rgba(150,70,200,0.22)'; c.fillRect(X + 1, Y + 1, cw - 2, cw - 2); }
      c.fillStyle = vis.has(k) ? 'rgba(127,247,255,0.06)' : 'rgba(0,0,0,0.55)'; c.fillRect(X + 1, Y + 1, cw - 2, cw - 2); }
    c.strokeStyle = 'rgba(127,247,255,0.12)'; c.lineWidth = 1; c.beginPath();
    for (let i = 0; i <= S.W; i++) { c.moveTo(r.x + i * cw + 0.5, r.y); c.lineTo(r.x + i * cw + 0.5, r.y + r.gh); }
    for (let j = 0; j <= S.H; j++) { c.moveTo(r.x, r.y + j * cw + 0.5); c.lineTo(r.x + r.gw, r.y + j * cw + 0.5); }
    c.stroke();
    // mines and probes (yours only: the enemy's are invisible to you)
    for (const m of v.mines) { const [x, y] = ctr(m.x, m.y); this.text('✳'.repeat(m.n), x, y + cw * 0.42, cw * 0.18, COL.warn, 'center'); }
    for (const p of v.probes) { const [x, y] = ctr(p.x, p.y); c.strokeStyle = mine; c.globalAlpha = p.fly ? 0.5 : 0.9; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y - cw * 0.36, cw * 0.12, cw * 0.07, 0, 0, 7); c.stroke(); c.globalAlpha = 1; }
    // starbases
    for (const b of v.bases) { const [x, y] = ctr(b.x, b.y), col = b.own ? mine : theirs;
      if (!b.alive) { this.text('✕', x, y + cw * 0.15, cw * 0.45, 'rgba(255,74,58,0.6)', 'center'); continue; }
      c.save(); c.translate(x, y); c.rotate(st.t * 0.5); c.strokeStyle = col; c.lineWidth = 2; c.shadowColor = col; c.shadowBlur = 10; c.beginPath(); c.moveTo(0, -cw * 0.28); c.lineTo(cw * 0.28, 0); c.lineTo(0, cw * 0.28); c.lineTo(-cw * 0.28, 0); c.closePath(); c.stroke(); c.restore(); c.shadowBlur = 0;
      if (b.hp >= 0) { c.strokeStyle = b.hp < 35 ? COL.bad : b.hp < 70 ? COL.warn : col; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, cw * 0.4, -Math.PI / 2, -Math.PI / 2 + b.hp / 100 * Math.PI * 2); c.stroke(); }
      if (b.siege && Math.floor(st.t * 3) % 2) this.text('SIEGE', x, y - cw * 0.46, u * 0.8, COL.bad, 'center');
    }
    // squadrons: yours exact, theirs as blips (? when at the edge of your sensors), ghosts fade with age
    for (const f of v.fleets) {
      if (f.own) {
        const k = clamp(f.mt, 0, 1), e = k * k * (3 - 2 * k), fx = f.px + (f.x - f.px) * e, fy = f.py + (f.y - f.py) * e; const [x, y] = ctr(fx, fy);
        if (f.order) { const [gx, gy] = ctr(f.order[0], f.order[1]); c.strokeStyle = mine; c.globalAlpha = 0.55; c.setLineDash([4, 4]); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(gx, gy); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
        const sel = st.sel === f.id; c.fillStyle = f.decoy ? 'rgba(200,200,200,0.5)' : mine; c.shadowColor = mine; c.shadowBlur = sel ? 16 : 6;
        c.beginPath(); c.moveTo(x, y - cw * 0.24); c.lineTo(x + cw * 0.22, y + cw * 0.18); c.lineTo(x, y + cw * 0.06); c.lineTo(x - cw * 0.22, y + cw * 0.18); c.closePath(); c.fill(); c.shadowBlur = 0;
        if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, cw * 0.34, 0, 7); c.stroke(); }
        this.text(f.decoy ? 'DECOY' : f.name + (f.d + f.l), x, y + cw * 0.44, cw * 0.2, '#fff', 'center');
      } else {
        const [x, y] = ctr(f.x, f.y), a = f.live ? 1 : clamp(1 - f.age / 45, 0.15, 0.6);
        c.globalAlpha = a; c.fillStyle = theirs; c.shadowColor = theirs; c.shadowBlur = f.live ? 10 : 0;
        c.beginPath(); c.arc(x, y, cw * 0.17, 0, 7); c.fill(); c.shadowBlur = 0;
        this.text(f.n ? String(f.n) : '?', x, y + cw * 0.08, cw * 0.22, '#000', 'center', 0, 900);
        if (!f.live) this.text(f.age + 'S', x, y + cw * 0.42, cw * 0.16, theirs, 'center');
        c.globalAlpha = 1;
      }
    }
    // flagships
    const blink = Math.floor(st.t * 2.5) % 2 === 0;
    if (v.foe) { const [x, y] = ctr(v.foe[0], v.foe[1]); c.strokeStyle = theirs; c.lineWidth = 2; c.beginPath(); c.arc(x, y, cw * 0.3, 0, 7); c.stroke(); this.text('ENEMY FLAGSHIP', x, y - cw * 0.4, u * 0.75, theirs, 'center'); }
    { const [x, y] = ctr(me.sx, me.sy); if (blink || me.warp) { c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 10; c.beginPath(); c.arc(x, y, cw * 0.1, 0, 7); c.fill(); c.shadowBlur = 0; } c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, cw * 0.2, 0, 7); c.stroke(); }
    // cursor + info
    const cu = st.cursor; if (cu) { const [x, y] = ctr(cu[0], cu[1]), h = cw * 0.5; c.strokeStyle = COL.warn; c.lineWidth = 2.5; c.shadowColor = COL.warn; c.shadowBlur = 10; c.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(x + sx * h, y + sy * h * 0.45); c.lineTo(x + sx * h, y + sy * h); c.lineTo(x + sx * h * 0.45, y + sy * h); } c.stroke(); c.shadowBlur = 0;
      const k = S.key(cu[0], cu[1]), here = v.fleets.filter(f => f.x === cu[0] && f.y === cu[1]), b = v.bases.find(b => b.x === cu[0] && b.y === cu[1] && b.alive);
      const parts = [];
      if (b) parts.push((b.own ? 'YOUR STARBASE' : 'ENEMY STARBASE') + (b.hp >= 0 ? ' ' + b.hp + '%' : ''));
      for (const f of here) parts.push(f.own ? (f.decoy ? 'YOUR DECOY' : 'SQUADRON ' + f.name + ' (' + f.d + ' DARTER' + (f.l ? ' ' + f.l + ' LANCER' : '') + ')') : (f.live ? 'ENEMY CONTACT' : 'LAST SEEN ' + f.age + ' S AGO') + (f.n ? ' ×' + f.n : ' · SIZE UNKNOWN'));
      if (!vis.has(k)) parts.push('NO SENSOR COVER'); if (neb.has(k)) parts.push('NEBULA');
      const iy = r.y + r.gh + u * 1.7;
      this.text(`${cu[0]},${cu[1]} · ${parts.join(' · ') || 'EMPTY SPACE'}`, W / 2, iy, u * 0.95, COL.hud, 'center', 4);
      const selF = v.fleets.find(f => f.id === st.sel);
      const wc = S.warpCost(st.G || { R: Math.random }, me, cu[0], cu[1]), can = !(cu[0] === me.sx && cu[1] === me.sy);
      const hint = selF ? `TAP A SECTOR TO SEND SQUADRON ${selF.name}${st.touch ? '' : ' (OR O)'}` : can ? `HYPERWARP ${wc.e} ENERGY${st.touch ? ' · TAP WARP' : ' · H OR ENTER'} · TAP A SQUADRON TO GIVE IT ORDERS` : 'TAP ONE OF YOUR SQUADRONS, THEN A SECTOR, TO SEND IT';
      this.text(hint, W / 2, iy + u * 1.5, u * 0.85, selF ? mine : COL.warn, 'center');
    }
    if (!st.touch && !this.port) this.text('ARROWS CURSOR · TAB SELECT SQUADRON · O SEND · B BUILD · Z PROBE · X DECOY · N MINES · J JAM · K ECCM · V REPAIR · F VIEW', W / 2, H - this.I.b - u * 1.2, u * 0.78, COL.dim, 'center');
  }
  /* ---------- Long-Range Scan: top-down around your ship ---------- */
  lrs(st) {
    const c = this.x, me = st.me, u = this.u, W = this.W, H = this.H;
    c.fillStyle = 'rgba(0,8,10,0.86)'; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2 + u, R = Math.min(W, H) * 0.38, range = 600;
    this.text('LONG-RANGE SCAN', W / 2, this.I.t + u * 2.4, u * 1.6, COL.hud, 'center', 10, 900);
    this.text('RANGE ' + range + ' · AHEAD IS UP', W / 2, this.I.t + u * 4, u * 0.9, COL.dim, 'center');
    if (me.dmg.L >= 2) { for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(127,247,255,${Math.random() * 0.25})`; c.fillRect(cx + (Math.random() - 0.5) * R * 2, cy + (Math.random() - 0.5) * R * 2, 2, 2); } this.text('LONG-RANGE SCAN DESTROYED', cx, cy, u * 1.5, COL.bad, 'center', 10); return; }
    c.strokeStyle = 'rgba(127,247,255,0.2)'; c.lineWidth = 1;
    for (const k of [0.25, 0.5, 1]) { c.beginPath(); c.ellipse(cx, cy, R * k, R * k * 0.62, 0, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R * 0.62); c.lineTo(cx, cy + R * 0.62); c.stroke();
    // sweep
    const a = st.t * 2 % (Math.PI * 2); c.strokeStyle = 'rgba(127,247,255,0.35)'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.62); c.stroke();
    const q = me.q, inv = [-q[0], -q[1], -q[2], q[3]];
    const blip = (pos, col, sz, label) => { const l = S.Q.rot(inv, V.sub(pos, me.pos)); const x = cx + clamp(l[0] / range, -1.1, 1.1) * R, y = cy + clamp(l[2] / range, -1.1, 1.1) * R * 0.62, hy = clamp(l[1] / range, -1, 1) * R * 0.5;
      c.strokeStyle = col; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - hy); c.stroke(); c.globalAlpha = 1; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 8; c.beginPath(); c.arc(x, y - hy, sz, 0, 7); c.fill(); c.shadowBlur = 0; if (label) this.text(label, x, y - hy - sz - 3, u * 0.75, col, 'center'); };
    if (st.base) blip(S.BASE_POS, COL.base, u * 0.8, 'STARBASE');
    for (const s of st.ships) { blip(s.pos, KCOL[s.kind], u * (s.kind === 'hive' ? 0.8 : 0.5), s.id === me.targetId ? 'TARGET' : '');
      if (me.dmg.L === 1) { const mp = [2 * me.pos[0] - s.pos[0], s.pos[1], 2 * me.pos[2] - s.pos[2]]; blip(mp, KCOL[s.kind], u * 0.5, ''); } }
    for (const sh of st.shots) blip(sh.pos, sh.kind === 'torp' ? COL.hud : COL.mag, 1.6, '');
    if (st.buddy) blip(st.buddy.pos, COL.buddy, u * 0.6, 'P' + (st.buddyIdx + 1));
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(cx, cy - u); c.lineTo(cx + u * 0.7, cy + u * 0.6); c.lineTo(cx - u * 0.7, cy + u * 0.6); c.fill();
    if (me.dmg.L === 1) this.text('SCANNER DAMAGED · GHOST ECHOES', cx, cy + R * 0.62 + u * 2, u * 0.95, COL.warn, 'center');
  }
}
