/* ==========================================================================
   ATARI FOOTBALL — sim.js
   The authoritative game simulation: rules, downs, clock, scoring, kicks,
   play execution, ball flight, catches, blocking and tackling.

   Runs on the local machine (vs CPU / hot-seat) or on the HOST in online
   play. It never touches the screen: renderers read Sim.snapshot().

   Phases: select -> presnap -> live -> result -> (select | kickset | quarter | over)
   ========================================================================== */
const Sim = (() => {
  const SPD = { C: 5.6, LG: 5.6, RG: 5.6, QB: 6.9, RB: 8.0, WR1: 8.3, WR2: 8.3, LE: 6.5, NT: 6.1, RE: 6.5, MLB: 7.3, CB1: 8.1, CB2: 8.1, S: 7.9, K: 6.6, COV: 7.7, KR: 8.2, KB: 6.9 };
  let G = null;

  /* ---------------- helpers ---------------- */
  const emit = n => { G.events.push({ s: ++G.evSeq, n }); if (G.events.length > 40) G.events.shift(); };
  const banner = (txt, sub = '', dur = 2.4, color) => { G.banner = { txt, sub, t: 0, dur, color: color || '#fff' }; };
  const opp = t => 1 - t;
  const P = i => G.players[i];
  const teamOf = i => i < 7 ? 0 : 1;
  const idx = (team, k) => team * 7 + k;
  const D = () => teamDir(G.off);
  /** world point from playbook coords [f,l] relative to the current snap */
  const W = (f, l) => ({ x: G.los + f * D(), y: clamp(G.by - l * D(), 0.8, FIELD_W - 0.8) });
  const carrierP = () => G.carrier >= 0 ? P(G.carrier) : null;
  const yardText = x => { const y = Math.round(x <= 60 ? x - 10 : 110 - x); if (y <= 0) return 'GOAL LINE'; if (y === 50) return '50'; return (x < 60 ? TEAMS[0].name : TEAMS[1].name) + ' ' + y; };
  const ordinal = n => ['', '1ST', '2ND', '3RD', '4TH'][n] || n + 'TH';

  function makePlayer(i) {
    return { i, team: teamOf(i), role: '', x: 0, y: 0, vx: 0, vy: 0, face: teamOf(i) === 0 ? 1 : -1, st: 'ok', stT: 0, eng: -1, noEngT: 0, route: [], ri: 0, as: null,
      lastTry: -9, juke: 0, jukeCd: 0, diveCd: 0, reach: 0, frame: 0, animT: 0, moving: false, dvx: 0, dvy: 0, spd: 7 };
  }

  /* ---------------- game setup ---------------- */
  function newGame(opts = {}) {
    G = {
      qLen: opts.qLen || 180, q: 1, clock: opts.qLen || 180, score: [0, 0], human: opts.human || [true, false],
      off: 0, los: 35, by: MID_Y, down: 1, togo: 10, phase: 'kickset', phT: 0, players: [], ball: { x: 60, y: MID_Y, z: 0, st: 'held', air: null },
      carrier: -1, events: [], evSeq: 0, banner: null, picks: [null, null], pend: [false, false], prePos: null, play: null, ctl: [3, 10], tgt: [5, 12], meter: null,
      openKick: 1, aiPickT: [0, 0], runoff: 0, next: null, reveal: null, lastPlay: [null, null], stats: { plays: 0, passes: 0, runs: 0, punts: 0, fgs: 0, kickoffs: 0, tds: 0 },
      resultInfo: null, over: false,
    };
    for (let i = 0; i < 14; i++) G.players.push(makePlayer(i));
    setupKickoff(1, 35);
    return G;
  }

  /* ---------------- kickoff ---------------- */
  function setupKickoff(kt, fromYd) {
    const rt = opp(kt), kd = teamDir(kt);
    G.off = kt; G.los = ownGoalX(kt) + kd * fromYd; G.by = MID_Y; G.carrier = -1;
    G.play = { kind: 'kickoff', t: 0, kickTeam: kt, recvTeam: rt, kicked: false, o: null, d: null };
    G.phase = 'kickset'; G.phT = 0; G.picks = [null, null]; G.pend = [false, false]; G.prePos = null; G.meter = null; G.reveal = null;
    const lanes = [4, 12, 20, 33.3, 41.3, 49.3];
    for (let k = 0; k < 7; k++) {
      const p = P(idx(kt, k)); reset(p);
      if (k === 3) { p.role = 'K'; p.x = G.los - kd * 7; p.y = MID_Y; }
      else { p.role = 'COV'; const ln = lanes[k > 3 ? k - 1 : k]; p.x = G.los - kd * 1; p.y = ln; }
      p.face = kd;
    }
    const rg = ownGoalX(rt), rd = teamDir(rt);
    const spots = [[25, 10], [25, 43.3], [30, 20], [30, 33.3], [17, 22], [17, 31.3], [3, MID_Y]];
    for (let k = 0; k < 7; k++) {
      const p = P(idx(rt, k)); reset(p);
      p.role = k === 6 ? 'KR' : 'KB'; p.x = rg + rd * spots[k][0]; p.y = spots[k][1]; p.face = rd;
    }
    G.ball.st = 'held'; G.ball.x = G.los; G.ball.y = MID_Y; G.ball.z = 0; G.ball.air = null;
    G.ctl[kt] = idx(kt, 2); G.ctl[rt] = idx(rt, 6);
    G.stats.kickoffs++;
  }
  function reset(p) { p.vx = p.vy = 0; p.st = 'ok'; p.stT = 0; p.eng = -1; p.noEngT = 0; p.route = []; p.ri = 0; p.as = null; p.juke = 0; p.jukeCd = 0; p.diveCd = 0; p.reach = 0; p.lastTry = -9; p.hold = 0; }

  /* ---------------- scrimmage: play selection ---------------- */
  function setupScrimmage() {
    G.phase = 'select'; G.phT = 0; G.picks = [null, null]; G.pend = [false, false]; G.prePos = null; G.carrier = -1; G.meter = null; G.reveal = null;
    G.aiPickT = [rand(0.5, 1.2), rand(0.6, 1.4)];
    G.play = null;
    placeFormation(PLAY_BY_ID.short, DEFENSE[0], true);
    G.ball.st = 'held'; G.ball.air = null; const c = P(idx(G.off, OI.C)); G.ball.x = c.x; G.ball.y = c.y; G.ball.z = 0;
  }
  /** valid play lists for a team in the current situation */
  function playsFor(team) { return team === G.off ? OFFENSE : DEFENSE; }
  function pick(team, id) {
    if (G.phase !== 'select' || G.picks[team]) return false;
    const list = playsFor(team);
    if (!list.some(p => p.id === id)) return false;
    G.picks[team] = id; if (!G.pend[team]) emit('lock'); G.pend[team] = true;
    if (G.picks[0] && G.picks[1]) beginPresnap();
    return true;
  }

  /** online guest locked in WITHOUT revealing the play (its id is only sent once the host has locked too) */
  function lockBlind(team) {
    if (G.phase !== 'select' || G.picks[team] || G.pend[team]) return false;
    G.pend[team] = true; emit('lock'); return true;
  }
  function placeFormation(o, d, preview) {
    const off = G.off, def = opp(off), dd = D();
    const fo = Object.assign({}, BASE_OFF, o.form || {});
    const fd = Object.assign({}, BASE_DEF, d.form || {});
    if (o.kind === 'punt') { // defense sends its safety back to return
      const back = Math.min(40, (ownGoalX(def) - G.los) * dd + 3);
      fd.S = [back, 0]; fd.CB1 = [8, 15]; fd.CB2 = [8, -15]; fd.MLB = [4, 3];
    }
    if (o.kind === 'fg') { fd.CB1 = [1.1, 5.5]; fd.CB2 = [1.1, -5.5]; fd.S = [6, 0]; fd.MLB = [2.5, 1.5]; }
    OFF_ROLES.forEach((r, k) => { const p = P(idx(off, k)); reset(p); p.role = r; const w = W(...fo[r]); p.x = w.x; p.y = w.y; p.face = dd; p.spd = SPD[r]; });
    DEF_ROLES.forEach((r, k) => { const p = P(idx(def, k)); reset(p); p.role = r; const w = W(...fd[r]); p.x = w.x; p.y = w.y; p.face = -dd; p.spd = SPD[r]; });
  }

  function beginPresnap() {
    const off = G.off, def = opp(off);
    const o = PLAY_BY_ID[G.picks[off]], d = PLAY_BY_ID[G.picks[def]];
    G.prePos = G.players.map(p => [+p.x.toFixed(2), +p.y.toFixed(2), p.face]); // what each side sees of the OTHER side until the snap
    G.play = { kind: o.kind, o, d, t: 0, thrown: false, pitched: false, handed: false, kicked: false, completed: false, passTo: -1, losAtSnap: G.los, kickFromX: 0, airKind: null };
    placeFormation(o, d, false);
    G.phase = 'presnap'; G.phT = 0;
    G.reveal = { off: o.name, def: d.name, t: 0 };
    G.lastPlay[off] = o.id; G.lastPlay[def] = d.id;
    G.ctl[off] = idx(off, OI.QB); G.ctl[def] = idx(def, DI.MLB);
    G.tgt[off] = idx(off, OI[o.primary || 'WR1']);
    if ((o.kind === 'punt' || o.kind === 'fg') && G.human[off]) G.meter = { v: 0, dir: 1, locked: false, acc: 0.4 };
    G.stats.plays++;
    if (o.kind === 'pass') G.stats.passes++; else if (o.kind === 'run') G.stats.runs++; else if (o.kind === 'punt') G.stats.punts++; else G.stats.fgs++;
  }

  function startLive() {
    const pl = G.play, off = G.off, def = opp(off);
    G.phase = 'live'; G.phT = 0; pl.t = 0; G.prePos = null;
    if (pl.kind === 'punt') G.ctl[def] = idx(def, DI.S);
    if (G.reveal) { G.reveal.t = 0.6; G.reveal.snapped = true; } // both calls are shown only now, after the snap
    for (let k = 0; k < 7; k++) { // routes & assignments
      const p = P(idx(off, k)); const pts = (pl.o.routes && pl.o.routes[p.role]) || [];
      p.route = pts.map(([f, l]) => W(f, l)); p.ri = 0;
      const q = P(idx(def, k)); const a = parseAssign(pl.d.as[q.role]); q.as = Object.assign({}, a);
      if (a.t === 'man') q.as.target = idx(off, OI[a.who]);
      if (a.t === 'zone' || a.t === 'deep') { const w = W(a.f, a.l); q.as.x = w.x; q.as.y = w.y; }
      if (pl.o.kind === 'punt' && q.role === 'S') q.as = { t: 'return' };
    }
    // snap: ball flies from center to QB / punter / holder
    const c = P(idx(off, OI.C)), qb = P(idx(off, OI.QB));
    const T = pl.kind === 'punt' ? 0.5 : pl.kind === 'fg' ? 0.35 : 0.14;
    launch('snap', c.x, c.y, qb.x, qb.y, T, pl.kind === 'punt' ? 0.8 : 0.3, qb.i);
    emit('snap');
  }

  /** put the ball in the air */
  function launch(kind, sx, sy, tx, ty, T, apex, target) {
    G.carrier = -1;
    G.ball.st = 'air'; G.ball.air = { kind, sx, sy, tx, ty, T: Math.max(0.05, T), t: 0, apex, target: target == null ? -1 : target };
    G.ball.x = sx; G.ball.y = sy; G.ball.z = 0.5;
  }
  function giveBall(i) { G.carrier = i; G.ball.st = 'held'; G.ball.air = null; const p = P(i); G.ball.x = p.x; G.ball.y = p.y; G.ball.z = 0; }

  /* ---------------- passing ---------------- */
  function throwPass(qb, ti) {
    const r = P(ti), d0 = dist(qb, r);
    const s = clamp(15 + d0 * 0.25, 15, 25);
    let tx = r.x, ty = r.y;
    for (let k = 0; k < 3; k++) { const t = Math.hypot(tx - qb.x, ty - qb.y) / s; tx = r.x + r.vx * t; ty = r.y + r.vy * t; }
    const d1 = Math.hypot(tx - qb.x, ty - qb.y);
    const pressure = G.players.some(p => p.team !== qb.team && p.st !== 'down' && dist(p, qb) < 2.6) ? 1 : 0;
    const err = (0.25 + d1 * 0.022 + pressure * 1.1) * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    tx += Math.cos(a) * err; ty = clamp(ty + Math.sin(a) * err, -1, FIELD_W + 1);
    launch('pass', qb.x, qb.y, tx, ty, Math.hypot(tx - qb.x, ty - qb.y) / s, clamp(d1 * 0.11, 1, 6.5), ti);
    G.play.thrown = true; G.play.passTo = ti; emit('throw');
    if (G.human[qb.team]) G.ctl[qb.team] = ti;
  }
  function pitch(qb) {
    const rb = P(idx(qb.team, OI.RB));
    const T = 0.34, tx = rb.x + rb.vx * T, ty = rb.y + rb.vy * T;
    launch('pitch', qb.x, qb.y, tx, ty, T, 0.9, rb.i); G.play.pitched = true; emit('throw');
  }
  function resolveCatch(air) {
    const off = G.off, bx = air.tx, by = air.ty, now = G.play.t;
    let rec = null, dr = 99, dfd = null, dd = 99;
    for (const p of G.players) {
      if (p.st === 'down') continue;
      const dd2 = Math.hypot(p.x - bx, p.y - by);
      if (p.team === off) { if (['RB', 'WR1', 'WR2'].includes(p.role) && dd2 < dr) { dr = dd2; rec = p; } }
      else if (dd2 < dd) { dd = dd2; dfd = p; }
    }
    const humanRec = rec && G.human[off] && G.ctl[off] === rec.i && rec.reach > 0;
    const humanDef = dfd && G.human[opp(off)] && G.ctl[opp(off)] === dfd.i && (dfd.reach > 0 || dfd.st === 'dive');
    const oob = by < 0 || by > FIELD_W || bx < 0 || bx > 120;
    if (dfd && dd < (humanDef ? 1.7 : 1.15) && (!rec || dd < dr - 0.15 || dr > 1.6)) {
      if (!oob && Math.random() < (humanDef ? 0.5 : 0.3)) { // interception
        giveBall(dfd.i); dfd.st = 'ok'; G.play.intercepted = true; G.possStartEZ = inOwnEZ(dfd);
        G.ctl[off] = nearestTo(off, dfd); if (G.human[dfd.team]) G.ctl[dfd.team] = dfd.i;
        emit('int'); banner('INTERCEPTED!', '', 1.2, '#ff6060'); return;
      }
      return incomplete('BROKEN UP!');
    }
    if (rec && dr <= (humanRec ? 1.9 : 1.6) && !oob) {
      const cover = dd < 1.7 ? 0.38 * (1 - dd / 1.7) : 0;
      if (Math.random() < 0.94 - cover + (humanRec ? 0.08 : 0)) {
        giveBall(rec.i); G.play.completed = true; emit('catch');
        if (G.human[off]) G.ctl[off] = rec.i;
        return;
      }
    }
    incomplete(oob ? 'OUT OF BOUNDS' : 'INCOMPLETE');
  }
  function incomplete(why) { G.ball.st = 'dead'; G.ball.z = 0; emit('incomplete'); endPlay({ type: 'inc', why }); }
  const inOwnEZ = p => p.team === 0 ? p.x < 10 : p.x > 110;
  function nearestTo(team, target, exclude) {
    let best = idx(team, 0), bd = 1e9;
    for (let k = 0; k < 7; k++) { const p = P(idx(team, k)); if (p.i === exclude || p.st === 'down') continue; const d = dist(p, target); if (d < bd) { bd = d; best = p.i; } }
    return best;
  }

  /* ---------------- kicks ---------------- */
  function doPunt(punter) {
    const pl = G.play, d = D(), acc = G.meter ? (G.meter.locked ? G.meter.acc : rand(0.25, 0.6)) : rand(0.45, 1);
    const Dist = 39 + acc * 17 + rand(-2, 2);
    let tx = punter.x + d * Dist; const ty = clamp(G.by + rand(-7, 7), 4, FIELD_W - 4);
    tx = clamp(tx, 1, 119);
    pl.kicked = true; pl.kickFromX = punter.x; G.meter && (G.meter.done = true);
    launch('punt', punter.x, punter.y, tx, ty, 3.0 + Dist * 0.02, 18, idx(opp(G.off), DI.S));
    emit('kick');
  }
  function doFG(holder) {
    const pl = G.play, d = D(), ex = d > 0 ? 120 : 0;
    const distYds = Math.abs(ex - holder.x) + 0.5;
    const base = clamp(1.05 - Math.max(0, distYds - 20) * 0.012, 0.08, 0.98);
    const acc = G.meter ? (G.meter.locked ? G.meter.acc : rand(0.15, 0.5)) : rand(0.55, 1);
    const p = clamp(base * (0.45 + 0.6 * acc), 0.02, 0.99);
    const good = distYds <= 62 && Math.random() < p;
    pl.kicked = true; pl.fgGood = good; pl.fgDist = Math.round(distYds); G.meter && (G.meter.done = true);
    const ty = good ? MID_Y + rand(-2.2, 2.2) : MID_Y + (Math.random() < 0.5 ? -1 : 1) * rand(3.8, 7);
    const short = !good && distYds > 50 && Math.random() < 0.5;
    launch('fg', holder.x, holder.y, short ? ex - d * rand(2, 8) : ex, ty, 1.0 + distYds * 0.012, short ? 6 : 10, -1);
    emit('kick');
  }
  function doKickoff(k) {
    const pl = G.play, rt = pl.recvTeam;
    const tx = ownGoalX(rt) + teamDir(rt) * rand(-3, 9), ty = MID_Y + rand(-8, 8);
    pl.kicked = true; launch('kickoff', k.x, k.y, tx, ty, 2.9, 15, idx(rt, 6)); emit('kick');
  }
  function kickArrives(air) {
    const pl = G.play, rt = air.kind === 'kickoff' ? pl.recvTeam : opp(G.off);
    const ret = P(air.target), dR = Math.hypot(ret.x - air.tx, ret.y - air.ty);
    const ezDepth = (ownGoalX(rt) - air.tx) * teamDir(rt); // >0 means in receiving team's end zone
    if (air.kind === 'punt' && ezDepth > 0) { G.ball.st = 'dead'; return endPlay({ type: 'touchback', team: rt, yd: 20 }); }
    if (air.kind === 'kickoff' && ezDepth > 9.5) { G.ball.st = 'dead'; return endPlay({ type: 'touchback', team: rt, yd: 25 }); }
    if (dR < 2.6 && ret.st !== 'down') {
      giveBall(ret.i); emit('catch'); G.possStartEZ = inOwnEZ(ret); pl.catchT = pl.t;
      G.ctl[ret.team] = ret.i; G.ctl[opp(ret.team)] = nearestTo(opp(ret.team), ret);
      if (air.kind === 'punt' && !G.human[rt]) { // AI returner calls a fair catch when the gunners are on him
        let near = 99; for (const q of G.players) if (q.team !== rt) near = Math.min(near, Math.hypot(q.x - ret.x, q.y - ret.y));
        if (near < 4.5) { ret.st = 'kneel'; return endPlay({ type: 'downed', team: rt, x: ret.x, y: ret.y }); }
      }
      if (!G.human[rt] && ezDepth > 3.5) { ret.st = 'kneel'; return endPlay({ type: 'touchback', team: rt, yd: air.kind === 'kickoff' ? 25 : 20 }); }
      return;
    }
    G.ball.st = 'dead'; G.ball.x = air.tx; G.ball.y = air.ty; G.ball.z = 0;
    if (ezDepth > 0) return endPlay({ type: 'touchback', team: rt, yd: air.kind === 'kickoff' ? 25 : 20 });
    endPlay({ type: 'downed', team: rt, x: air.tx, y: air.ty });
  }

  /* ---------------- per-frame update ---------------- */
  function update(dt, inputs) {
    if (!G) return;
    G.phT += dt;
    if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
    if (G.reveal) { G.reveal.t += dt; if (G.reveal.t > 2.6 && G.phase !== 'presnap') G.reveal = null; }
    if (G.meter && !G.meter.locked && !G.meter.done) { const m = G.meter; m.v += m.dir * dt * 1.5; if (m.v > 1) { m.v = 2 - m.v; m.dir = -1; } if (m.v < 0) { m.v = -m.v; m.dir = 1; } }
    switch (G.phase) {
      case 'select':
        for (const t of [0, 1]) if (!G.human[t] && !G.picks[t]) { G.aiPickT[t] -= dt; if (G.aiPickT[t] <= 0) pick(t, t === G.off ? AI.callOffense(G, t) : AI.callDefense(G, t)); }
        break;
      case 'presnap':
        meterInput(inputs);
        if (G.phT > 0.35 && G.phT - dt <= 0.35) emit('hut');
        if (G.phT > 0.75 && G.phT - dt <= 0.75) emit('hut');
        if (G.phT >= 1.05) startLive();
        break;
      case 'kickset':
        if (G.phT > 0.2 && G.phT - dt <= 0.2) emit('whistle');
        if (G.phT >= 1.3) { G.phase = 'live'; G.phT = 0; G.play.t = 0; }
        break;
      case 'live': live(dt, inputs); break;
      case 'result':
        if (G.runoff > 0) { const r = Math.min(G.runoff, dt * 10); G.runoff -= r; const before = Math.ceil(G.clock); G.clock = Math.max(0, G.clock - r); if (G.clock < 10 && Math.ceil(G.clock) < before) emit('tick'); }
        if (G.phT > 2.5 && G.runoff <= 0) afterResult();
        break;
      case 'quarter':
        if (G.phT > 2.6) { G.phase = 'idle'; const n = G.next; G.next = null; n && n(); }
        break;
    }
    // animation bookkeeping
    for (const p of G.players) {
      const sp = Math.hypot(p.vx, p.vy); p.moving = sp > 0.6;
      if (p.moving) { p.animT += dt * sp * 0.9; p.frame = Math.floor(p.animT) & 1; if (Math.abs(p.vx) > 0.3) p.face = sgn(p.vx); }
    }
  }
  function meterInput(inputs) {
    if (!G.meter || G.meter.locked) return;
    const inp = inputs[G.off];
    if (inp && inp.aP && G.human[G.off]) { G.meter.locked = true; G.meter.acc = 1 - Math.abs(G.meter.v - 0.5) * 2; emit('beep'); inp.aP = false; }
  }

  function live(dt, inputs) {
    const pl = G.play; pl.t += dt;
    // game clock (counts down during live action), ticks in the last 10 seconds
    const before = Math.ceil(G.clock); G.clock = Math.max(0, G.clock - dt);
    if (G.clock < 10 && Math.ceil(G.clock) < before) emit('tick');

    scripted(pl, inputs);
    if (G.phase !== 'live') return;
    humanButtons(inputs);
    if (G.phase !== 'live') return;

    // steering
    for (const p of G.players) {
      if (p.stT > 0) { p.stT -= dt; if (p.stT <= 0) { if (p.st === 'dive') { p.st = 'down'; p.stT = 0.45; } else if (p.st === 'eng') { shed(p); } else if (p.st !== 'kneel') p.st = 'ok'; } }
      if (p.noEngT > 0) p.noEngT -= dt;
      if (p.juke > 0) p.juke -= dt; if (p.jukeCd > 0) p.jukeCd -= dt; if (p.diveCd > 0) p.diveCd -= dt; if (p.reach > 0) p.reach -= dt;
      let want;
      const team = p.team, inp = inputs[team];
      const isHuman = G.human[team] && G.ctl[team] === p.i && inp;
      if (p.st === 'down' || p.st === 'stun' || p.st === 'kneel') want = { x: 0, y: 0 };
      else if (p.st === 'dive') want = { x: p.dvx, y: p.dvy };
      else if (isHuman && (inp.x || inp.y)) { const m = Math.hypot(inp.x, inp.y); want = { x: inp.x / m * p.spd * 1.03, y: inp.y / m * p.spd * 1.03 }; p.hold = 0; }
      else if (isHuman && !humanAssist(p)) want = { x: 0, y: 0 };
      else want = AI.steer(G, p, dt) || { x: 0, y: 0 };
      let sp = Math.hypot(want.x, want.y), max = p.spd * (G.carrier === p.i ? 0.97 : 1) * (p.juke > 0 ? 1.25 : 1) * (p.st === 'dive' ? 1.6 : 1);
      if (p.st === 'eng') max *= 0.2;
      if (sp > max) { want.x *= max / sp; want.y *= max / sp; }
      const acc = (isHuman ? 60 : 32) * dt;
      const dvx = want.x - p.vx, dvy = want.y - p.vy, dm = Math.hypot(dvx, dvy);
      if (dm <= acc) { p.vx = want.x; p.vy = want.y; } else { p.vx += dvx / dm * acc; p.vy += dvy / dm * acc; }
    }
    // integrate
    for (const p of G.players) { p.x += p.vx * dt; p.y += p.vy * dt; }
    blocking(dt);
    separate();
    // ball
    const b = G.ball;
    if (b.st === 'held' && G.carrier >= 0) { const c = carrierP(); b.x = c.x; b.y = c.y; b.z = 0; }
    else if (b.st === 'air') {
      const a = b.air; a.t += dt; const u = Math.min(1, a.t / a.T);
      b.x = lerp(a.sx, a.tx, u); b.y = lerp(a.sy, a.ty, u); b.z = 4 * a.apex * u * (1 - u) + 0.4 * (1 - u);
      if (u >= 1) ballArrives(a);
    }
    if (G.phase !== 'live') return;
    rulesCheck();
  }

  /** zero-stick human players keep a little AI help (QB drop, receiver under the ball, carrier on his path) */
  function humanAssist(p) {
    const pl = G.play; if (!pl) return false;
    if (G.ball.st === 'air' && G.ball.air.target === p.i) return true;          // run under the pass / kick
    if (G.carrier === p.i && p.ri < p.route.length) return true;               // keep running the designed path
    if (G.carrier === p.i && p.role === 'QB' && pl.t < 1.2) return true;        // QB drop
    if (G.carrier === -1 && G.ball.st === 'air' && G.ball.air.kind === 'snap') return true;
    if (G.carrier === p.i && pl.kicked && (pl.kind === 'kickoff' || pl.kind === 'punt') && pl.t - (pl.catchT || 0) < 0.9) return true; // first steps of a return
    return false;
  }

  /** scripted beats of each play: handoffs, pitches, kicks */
  function scripted(pl, inputs) {
    const off = G.off;
    if (pl.kind === 'kickoff') {
      const k = P(idx(pl.kickTeam, 3));
      if (!pl.kicked && pl.t > 0.75) doKickoff(k);
      return;
    }
    const qb = P(idx(off, OI.QB)), rb = P(idx(off, OI.RB));
    if (pl.kind === 'run' && pl.o.carrier === 'RB' && !pl.o.pitch && !pl.handed && G.carrier === qb.i && pl.t >= pl.o.handoff) {
      if (dist(qb, rb) < 2.2 || pl.t > pl.o.handoff + 0.5) { giveBall(rb.i); pl.handed = true; if (G.human[off]) G.ctl[off] = rb.i; }
    }
    if (pl.kind === 'run' && pl.o.pitch && !pl.pitched && G.carrier === qb.i && !G.human[off] && pl.t > 0.38) pitch(qb);
    const waitMeter = lim => G.human[off] && G.meter && !G.meter.locked && pl.t < lim; // a human kicker gets a moment to time the meter
    if (pl.kind === 'punt' && !pl.kicked && G.carrier === qb.i && pl.t > 1.3 && !waitMeter(2.1)) doPunt(qb);
    if (pl.kind === 'fg' && !pl.kicked && G.carrier === qb.i && pl.t > 0.95 && !waitMeter(1.8)) doFG(qb);
    // AI quarterback decisions
    if (pl.kind === 'pass' && !pl.thrown && G.carrier === qb.i && !G.human[off]) {
      const dcs = AI.qb(G, qb);
      if (dcs && dcs.throwTo != null) throwPass(qb, dcs.throwTo);
    }
    if (pl.kind === 'pass' && !pl.thrown && G.carrier === qb.i && G.human[off] && pl.t > 6.5 && qb.x * D() < G.los * D()) {/* human holds: allowed */ }
    meterInput(inputs);
  }

  function humanButtons(inputs) {
    const pl = G.play;
    for (const team of [0, 1]) {
      const inp = inputs[team]; if (!G.human[team] || !inp) continue;
      const me = P(G.ctl[team]), hasBall = G.carrier >= 0 && teamOf(G.carrier) === team, d = teamDir(team);
      if (inp.bP) { // CYCLE
        if (hasBall && G.carrier === me.i && me.role === 'QB' && pl.kind === 'pass' && !pl.thrown) {
          const order = ['WR1', 'WR2', 'RB'].map(r => idx(team, OI[r])); const k = order.indexOf(G.tgt[team]);
          G.tgt[team] = order[(k + 1) % order.length]; emit('beep');
        } else if (hasBall && G.carrier === me.i && inOwnEZ(me) && G.possStartEZ && (pl.kind === 'kickoff' || pl.kind === 'punt' || pl.intercepted)) {
          me.st = 'kneel'; return endPlay({ type: 'touchback', team, yd: pl.kind === 'kickoff' ? 25 : 20 });
        } else if (!hasBall) {
          const ref = G.carrier >= 0 ? carrierP() : G.ball;
          G.ctl[team] = nearestTo(team, ref, me.i); emit('beep');
        }
      }
      if (inp.aP) { // ACTION
        if (pl.kind === 'punt' || pl.kind === 'fg') { if (team === G.off && G.meter && !G.meter.locked) continue; }
        if (hasBall && G.carrier === me.i) {
          if (me.role === 'QB' && pl.kind === 'pass' && !pl.thrown && (me.x - G.los) * d < 0.5) { throwPass(me, G.tgt[team]); continue; }
          if (me.role === 'QB' && pl.o && pl.o.pitch && !pl.pitched && (me.x - G.los) * d < 0.5) { pitch(me); continue; }
          if (me.jukeCd <= 0) { me.juke = 0.35; me.jukeCd = 1.1; emit('juke'); }
        } else if (G.ball.st === 'air' && G.ball.air.target === me.i) { me.reach = 0.45; }
        else if (!hasBall && me.st === 'ok' && me.diveCd <= 0) {
          const ref = G.carrier >= 0 ? carrierP() : G.ball;
          let dx = inp.x, dy = inp.y; if (!dx && !dy) { dx = ref.x - me.x; dy = ref.y - me.y; }
          const m = Math.hypot(dx, dy) || 1; me.dvx = dx / m * me.spd * 1.6; me.dvy = dy / m * me.spd * 1.6;
          me.st = 'dive'; me.stT = 0.3; me.diveCd = 1.0; me.reach = 0.4; emit('dive');
        } else if (me.st === 'eng') { me.stT -= 0.3; } // rip free of a block
      }
    }
  }

  function ballArrives(a) {
    if (a.kind === 'snap') { giveBall(a.target); return; }
    if (a.kind === 'pitch') { const rb = P(a.target); giveBall(rb.i); if (G.human[rb.team]) G.ctl[rb.team] = rb.i; emit('catch'); return; }
    if (a.kind === 'pass') return resolveCatch(a);
    if (a.kind === 'punt' || a.kind === 'kickoff') return kickArrives(a);
    if (a.kind === 'fg') { G.ball.st = 'dead'; G.ball.z = 0; return endPlay({ type: 'fg', good: G.play.fgGood, dist: G.play.fgDist }); }
  }

  /* ---------------- blocking ---------------- */
  function shed(p) { const b = p.eng >= 0 ? P(p.eng) : null; p.st = 'ok'; p.eng = -1; p.noEngT = 1.0; if (b) { b.eng = -1; b.noEngT = 0.6; } }
  function blocking(dt) {
    const hasBallTeam = G.carrier >= 0 ? teamOf(G.carrier) : (G.ball.st === 'air' && G.ball.air.kind === 'pass' ? G.off : (G.ball.st === 'air' && G.ball.air.kind === 'snap' ? G.off : -1));
    for (const b of G.players) {
      if (b.i === G.carrier || b.st !== 'ok' || b.eng >= 0 || b.noEngT > 0) continue;
      if (!AI.isBlocking(G, b, hasBallTeam)) continue;
      for (const d of G.players) {
        if (d.team === b.team || d.i === G.carrier || d.st !== 'ok' || d.noEngT > 0 || d.role === 'QB' || d.role === 'KR') continue;
        if (Math.abs(d.x - b.x) > 1.05 || Math.abs(d.y - b.y) > 1.05) continue;
        if (Math.hypot(d.x - b.x, d.y - b.y) > 1.0) continue;
        const dl = ['LE', 'NT', 'RE'].includes(d.role) && ['C', 'LG', 'RG'].includes(b.role);
        d.st = 'eng'; d.eng = b.i; d.stT = dl ? rand(1.0, 2.7) : rand(0.7, 1.6); b.eng = d.i;
        if (G.play && G.play.o && G.play.o.block === 'screen' && dl) d.stT = 0.45;
        break;
      }
    }
    // engaged pairs stick together: blocker stays between his man and the ball
    for (const d of G.players) {
      if (d.st !== 'eng') continue;
      const b = P(d.eng); if (!b || b.eng !== d.i) { d.st = 'ok'; d.eng = -1; continue; }
      const ref = G.carrier >= 0 ? carrierP() : G.ball;
      const ax = ref.x - d.x, ay = ref.y - d.y, am = Math.hypot(ax, ay) || 1;
      b.x = lerp(b.x, d.x + ax / am * 0.85, 0.35); b.y = lerp(b.y, d.y + ay / am * 0.85, 0.35); b.vx = d.vx; b.vy = d.vy;
      if (Math.hypot(b.x - d.x, b.y - d.y) > 1.8) shed(d);
    }
  }
  function separate() {
    const ps = G.players;
    for (let i = 0; i < 14; i++) for (let j = i + 1; j < 14; j++) {
      const a = ps[i], b = ps[j];
      if (a.st === 'down' || b.st === 'down' || a.eng === j || b.eng === i) continue;
      const dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) > 0.7 || Math.abs(dy) > 0.7) continue;
      const d = Math.hypot(dx, dy); if (d >= 0.7 || d < 1e-4) continue;
      const push = (0.7 - d) * 0.5, ux = dx / d, uy = dy / d;
      const wa = a.i === G.carrier ? 0.3 : 1, wb = b.i === G.carrier ? 0.3 : 1;
      a.x -= ux * push * wa; a.y -= uy * push * wa; b.x += ux * push * wb; b.y += uy * push * wb;
    }
  }

  /* ---------------- tackles, boundaries, scoring ---------------- */
  function rulesCheck() {
    const c = carrierP(); if (!c) return;
    const t = c.team;
    if (!inOwnEZ(c)) G.possStartEZ = false;
    // touchdown
    if ((t === 0 && c.x >= 110) || (t === 1 && c.x <= 10)) return endPlay({ type: 'td', team: t });
    // out of bounds
    if (c.y < 0 || c.y > FIELD_W || c.x < 0 || c.x > 120) { emit('whistle'); return endPlay({ type: 'oob', team: t, x: clamp(c.x, 0, 120), y: c.y }); }
    // tackles
    for (const q of G.players) {
      if (q.team === t || q.st === 'down' || q.st === 'stun' || q.st === 'eng' || q.st === 'kneel') continue;
      const r = q.st === 'dive' ? 1.35 : 0.85;
      if (Math.abs(q.x - c.x) > r || Math.abs(q.y - c.y) > r) continue;
      if (Math.hypot(q.x - c.x, q.y - c.y) > r || G.play.t - q.lastTry < 0.45) continue;
      q.lastTry = G.play.t;
      let p = q.st === 'dive' ? 0.92 : (G.human[q.team] && G.ctl[q.team] === q.i ? 0.82 : 0.64);
      if (c.juke > 0) p *= 0.4;
      if (c.role === 'QB' && G.play.kind === 'pass' && !G.play.thrown) p = Math.min(0.96, p + 0.18);
      if (Math.random() < p) {
        q.st = 'down'; q.stT = 9; c.st = 'down'; c.stT = 9; c.vx = c.vy = 0; emit('hit');
        return endPlay({ type: 'tackle', team: t, x: c.x, y: c.y });
      }
      q.st = 'stun'; q.stT = 0.6; c.vx *= 0.55; c.vy *= 0.55; emit('miss');
    }
  }

  /* ---------------- end of play & bookkeeping ---------------- */
  function endPlay(o) {
    if (G.phase !== 'live') return;
    G.phase = 'result'; G.phT = 0; G.runoff = 0;
    for (const p of G.players) { p.vx *= 0.2; p.vy *= 0.2; }
    if (o.type !== 'td' && o.type !== 'fg') emit('whistle');
    resolve(o);
  }

  function resolve(o) {
    const pl = G.play, off = G.off, d = teamDir(off), kind = pl.kind;
    let txt = '', sub = '', color = '#fff', next;
    const scrimmage = kind === 'run' || kind === 'pass';
    const toScrimmage = (team, x, y) => () => { G.off = team; G.los = clampLos(team, x); G.by = clamp(y == null ? G.by : y, MID_Y - 6, MID_Y + 6); setFirstDown(); setupScrimmage(); };

    if (o.type === 'td') {
      G.score[o.team] += 7; G.stats.tds++;
      txt = 'TOUCHDOWN!'; sub = TEAMS[o.team].name + ' SCORES 7'; color = TEAMS[o.team].main; emit('td');
      next = () => setupKickoff(o.team, 35);
    } else if (o.type === 'fg') {
      if (o.good) { G.score[off] += 3; txt = 'FIELD GOAL IS GOOD!'; sub = o.dist + ' YARDS'; color = TEAMS[off].main; emit('fgGood'); next = () => setupKickoff(off, 35); }
      else {
        txt = 'NO GOOD!'; sub = o.dist + ' YARD ATTEMPT'; emit('groan');
        const r = opp(off); let x = G.los - d * 7; if ((x - ownGoalX(r)) * teamDir(r) < 20) x = ownGoalX(r) + teamDir(r) * 20;
        next = () => { G.off = r; G.los = x; G.by = MID_Y; G.down = 1; G.togo = 10; setFirstDown(); setupScrimmage(); };
      }
    } else if (o.type === 'touchback') {
      txt = 'TOUCHBACK'; sub = TEAMS[o.team].name + ' BALL ON THE ' + o.yd;
      next = () => { G.off = o.team; G.los = ownGoalX(o.team) + teamDir(o.team) * o.yd; G.by = MID_Y; G.down = 1; G.togo = 10; setFirstDown(); setupScrimmage(); };
    } else if (o.type === 'inc') {
      txt = o.why || 'INCOMPLETE'; color = '#ff9a6a';
      G.down++;
      if (G.down > 4) { sub = 'TURNOVER ON DOWNS'; const r = opp(off), x = G.los; next = () => { G.off = r; G.los = x; G.down = 1; G.togo = 10; setFirstDown(); setupScrimmage(); }; }
      else { sub = ordinal(G.down) + ' & ' + togoText(); next = () => setupScrimmage(); }
    } else { // tackle / oob / downed
      const x = o.x != null ? o.x : G.ball.x, y = o.y != null ? o.y : G.ball.y, ct = o.team;
      // safety: carrier downed in his own end zone (unless he caught a kick / pick there)
      if ((ct === 0 && x < 10) || (ct === 1 && x > 110)) {
        const kickRet = (kind === 'kickoff' && ct === pl.recvTeam) || (kind === 'punt' && pl.kicked && ct !== off);
        if (G.possStartEZ || o.type === 'downed' || kickRet) { return resolve({ type: 'touchback', team: ct, yd: kind === 'kickoff' ? 25 : 20 }); }
        G.score[opp(ct)] += 2; txt = 'SAFETY!'; sub = TEAMS[opp(ct)].name + ' +2'; emit('cheer');
        next = () => setupKickoff(ct, 20);
      } else if ((scrimmage || ((kind === 'punt' || kind === 'fg') && !pl.kicked)) && ct === off) {
        const gain = Math.round((x - G.los) * d);
        const qbSack = pl.kind === 'pass' && !pl.thrown && G.carrier === idx(off, OI.QB) && gain < 0;
        if (qbSack) { txt = 'SACKED!'; color = '#ff6060'; sub = 'LOSS OF ' + (-gain); }
        else if (pl.completed) { txt = 'PASS COMPLETE'; sub = gain >= 0 ? 'GAIN OF ' + gain : 'LOSS OF ' + (-gain); }
        else { txt = gain > 0 ? 'RUN FOR ' + gain + (gain === 1 ? ' YARD' : ' YARDS') : gain === 0 ? 'NO GAIN' : 'LOSS OF ' + (-gain); }
        if (o.type === 'oob') sub = (sub ? sub + ' - ' : '') + 'OUT OF BOUNDS';
        const exactGain = (x - G.los) * d;
        if (exactGain >= G.togo - 0.001 + 0) { G.down = 1; G.togo = 10; txt2(); }
        else {
          G.down++; G.togo = G.togo - exactGain;
          if (G.down > 4) { sub = 'TURNOVER ON DOWNS'; color = '#ff9a6a'; const r = opp(off); next = toScrimmage(r, x, y); G.down = 1; G.togo = 10; }
        }
        function txt2() { sub = 'FIRST DOWN!'; color = '#ffe048'; emit('first'); }
        if (!next) next = () => { G.los = clampLos(off, x); G.by = clamp(y, MID_Y - 6, MID_Y + 6); if (G.down === 1) setFirstDown(); else G.fdX = G.los + G.togo * d; G.togo = Math.max(0.5, G.togo); fixGoalToGo(); setupScrimmage(); };
      } else { // change of possession: returns and interceptions
        const yl = yardText(x);
        if (kind === 'kickoff') { txt = 'KICKOFF RETURN'; sub = 'TO THE ' + yl; }
        else if (kind === 'punt') { txt = 'PUNT ' + Math.round(Math.abs(pl.losAtSnap - x)) + ' YDS NET'; sub = o.type === 'downed' ? 'DOWNED AT THE ' + yl : 'RETURNED TO THE ' + yl; }
        else if (pl.intercepted) { txt = 'INTERCEPTED!'; color = '#ff6060'; sub = 'RETURNED TO THE ' + yl; }
        else { txt = 'TURNOVER'; sub = 'AT THE ' + yl; }
        G.down = 1; G.togo = 10; next = toScrimmage(ct, x, y);
      }
      if (o.type === 'tackle' && G.phase === 'result') G.runoff = Math.min(G.clock, 11);
    }
    G.resultInfo = { type: o.type, txt, sub };
    banner(txt, sub, 2.5, color);
    G.next = next;
  }
  function togoText() { return G.fdX != null && ((G.off === 0 && G.fdX >= 110) || (G.off === 1 && G.fdX <= 10)) ? 'GOAL' : String(Math.max(1, Math.round(G.togo))); }
  function clampLos(team, x) { return clamp(x, 10.5, 109.5); }
  function setFirstDown() { const d = teamDir(G.off); G.down = G.down || 1; G.fdX = G.los + d * G.togo; fixGoalToGo(); }
  function fixGoalToGo() { const d = teamDir(G.off), gl = goalX(G.off); if ((G.fdX - gl) * d >= 0) { G.fdX = gl; G.togo = Math.abs(gl - G.los); } }

  function afterResult() {
    const n = G.next; G.next = null;
    if (G.clock <= 0) {
      if (G.q >= 4) {
        if (G.score[0] === G.score[1] && !G.ot) { G.ot = true; } // tie stands (classic)
        G.phase = 'over'; G.phT = 0; G.over = true; emit('whistle2');
        banner('FINAL', G.score[0] === G.score[1] ? 'TIE GAME' : TEAMS[G.score[0] > G.score[1] ? 0 : 1].name + ' WINS!', 999);
        return;
      }
      G.q++; G.clock = G.qLen; G.phase = 'quarter'; G.phT = 0; emit('whistle2');
      if (G.q === 3) { banner('HALFTIME', TEAMS[0].name + ' ' + G.score[0] + '  ' + TEAMS[1].name + ' ' + G.score[1], 2.6); G.next = () => { G.down = 1; G.togo = 10; setupKickoff(opp(G.openKick), 35); }; }
      else { banner('END OF QUARTER ' + (G.q - 1), '', 2.6); G.next = n; }
      return;
    }
    n && n();
  }

  /* ---------------- snapshot (what renderers / the guest see) ---------------- */
  /**
   * snapshot(viewer): what ONE screen may see. viewer = 0 (BLUE) / 1 (GOLD) / -1 (everything, local same-screen).
   * Until the ball is snapped the opponent's call is stripped out: no play name, no play kind, no kick meter,
   * no pass target, and the opponent's players stay in the neutral pre-call lineup (their real formation would
   * give the call away). The host builds snapshot(1) for the network, so GOLD's browser never receives BLUE's call.
   */
  function snapshot(viewer = -1) {
    const pl = G.play, pre = G.phase === 'select' || G.phase === 'presnap', hideOpp = viewer >= 0 && pre;
    const mine = t => viewer < 0 || t === viewer;
    const pos = G.players.map((p, i) => (hideOpp && G.prePos && !mine(i < 7 ? 0 : 1)) ? G.prePos[i] : [p.x, p.y, p.face]);
    const rv = G.reveal ? {
      off: !hideOpp || mine(G.off) ? G.reveal.off : null, def: !hideOpp || mine(opp(G.off)) ? G.reveal.def : null,
      t: +G.reveal.t.toFixed(2), snapped: !!G.reveal.snapped,
    } : null;
    return {
      ph: G.phase, phT: +G.phT.toFixed(2), q: G.q, clk: +G.clock.toFixed(1), sc: G.score.slice(), off: G.off, dn: G.down, tg: togoText(), los: +G.los.toFixed(2), fd: G.fdX != null ? +G.fdX.toFixed(2) : null,
      pl: G.players.map((p, i) => [+(+pos[i][0]).toFixed(2), +(+pos[i][1]).toFixed(2), pos[i][2], p.frame, p.moving && !(hideOpp && G.prePos && !mine(i < 7 ? 0 : 1)) ? 1 : 0, p.st === 'down' || p.st === 'stun' || p.st === 'kneel' ? 1 : p.st === 'dive' ? 2 : 0]),
      roles: G.players.map(p => p.role),
      b: [+G.ball.x.toFixed(2), +G.ball.y.toFixed(2), +G.ball.z.toFixed(2), G.ball.st === 'air' ? 1 : G.ball.st === 'dead' ? 2 : 0, G.carrier],
      bt: G.ball.st === 'air' ? [+G.ball.air.tx.toFixed(2), +G.ball.air.ty.toFixed(2), G.ball.air.kind] : null,
      // free-running speed of each controlled player (0 = not under free stick control): lets the guest predict its own player
      cs: G.ctl.map(i => { const p = G.players[i]; return G.phase === 'live' && p.st === 'ok' ? +Math.min(p.spd * 1.03, p.spd * (G.carrier === p.i ? 0.97 : 1) * (p.juke > 0 ? 1.25 : 1)).toFixed(2) : 0; }),
      ctl: G.ctl.slice(), tgt: G.tgt.map((v, t) => mine(t) ? v : -1), hum: G.human.slice(),
      kind: pl && (!hideOpp || mine(G.off)) ? pl.kind : null, thrown: pl ? !!pl.thrown : false,
      lk: [!!(G.picks[0] || G.pend[0]), !!(G.picks[1] || G.pend[1])],
      bn: G.banner ? { txt: G.banner.txt, sub: G.banner.sub, t: +G.banner.t.toFixed(2), dur: G.banner.dur, c: G.banner.color } : null,
      rv,
      mt: G.meter && mine(G.off) ? [+G.meter.v.toFixed(3), G.meter.locked ? 1 : 0, G.meter.done ? 1 : 0] : null,
      ev: G.events.slice(-12), over: G.over,
    };
  }

  return {
    newGame, update, pick, lockBlind, snapshot, playsFor,
    get G() { return G; },
    // test helpers
    _setupScrimmage: setupScrimmage, _setupKickoff: setupKickoff, _endPlay: endPlay,
    yardText, ordinal,
  };
})();
