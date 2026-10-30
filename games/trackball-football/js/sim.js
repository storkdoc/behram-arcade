/* ==========================================================================
   TRACKBALL FOOTBALL — sim.js
   The whole game: rules, physics and CPU players. Field units are yards:
   x 0..120 (goal lines at 10 and 110), y 0..53.33 (0 = far sideline).
   Team 0 (XPRESS, the X's) always attacks +x, team 1 (OUTLAWS, the O's) -x.
   Players 0-6 are team 0, 7-13 team 1. One fixed 60 Hz step. The host (or
   the CPU game) runs this; online guests only ever see snapshot() output,
   which never contains a play call before the snap.
   ========================================================================== */
const STEP = 1 / 60;
const FIELD_W = 53.333, MID_Y = FIELD_W / 2;
const HASH = [MID_Y - 3.1, MID_Y + 3.1];
const BASE_V = { C: 6.4, LG: 6.4, RG: 6.4, QB: 7.6, RB: 8.6, WR: 8.9, DT: 6.7, DE: 7.4, LB: 8.0, CB: 8.8, S: 8.6 };
let HUMAN_TOP = 1.0; // human-steered player's top speed at full trackball spin (x command magnitude, max 1.15)
const SKILL = [ // rookie / pro / all-pro (applied to the CPU team; human teammates play at "pro")
  { spd: 0.87, react: 0.42, tackle: 0.72, shed: 3.2, acc: 2.2, esc: 0.55, read: 2.0, cover: 0.55, int: 0.18, angle: 0.65, dive: 0.6, bite: 0.36, learn: 0.6, chase: 1.09 },
  { spd: 0.95, react: 0.24, tackle: 0.95, shed: 2.3, acc: 1.1, esc: 0.72, read: 1.5, cover: 0.8, int: 0.3, angle: 0.85, dive: 0.8, bite: 0.45, learn: 0.8, chase: 1 },
  { spd: 1.02, react: 0.1, tackle: 1.15, shed: 1.6, acc: 0.45, esc: 0.88, read: 1.1, cover: 1.0, int: 0.42, angle: 1.0, dive: 1.0, bite: 0.32, learn: 1.0, chase: 1 },
];
// angle: how well pursuit leads the runner (0 = chase his back, 1 = true intercept course) · dive: CPU ankle-tackle dives ·
// bite: chance a well-timed juke fakes a defender out · learn: how hard the defense keys on a runner's habits ·
// chase: run-pursuit hustle (rookies are slow in coverage but still run to the ball)
/* The ball carrier (human or CPU, either team): the trackball can't make him outrun physics.
   He tops out at his position's speed (spinning harder than "full" adds nothing with the ball), he can't turn a
   sprint on a dime (cuts cost momentum unless you juke), and he tires on a long run. */
const RUN = {
  top: 1.0,                 // human carrier's top speed x his position speed (non-carriers may still go up to 1.15)
  acc: 15, cutAcc: 34,      // carrier acceleration (yd/s^2): a sharp cut at full speed takes ~0.6 s; during a juke it's crisp
  tireAfter: 3, tireSpan: 4, tireMin: 0.92, // after 3 s carrying he fades to 92% of top speed over the next 4 s
  juke: { cd: 1.1, burst: 0.32, boost: 1.1, near: 0.9, far: 2.7, whiff: 3.6, stun: 0.5 }, // a juke fakes out a man 0.9-2.7 yd away; with nobody near it's a wasted plant
  mash: 0.035, spin: 0.75,  // breaking a wrap: each Space mash and the trackball spin (x a per-tackle luck of 0.6-1.45, usually low)
};
// timed-press interceptions (defensive ACTION while a pass is in the air). e = press time minus ball arrival (s, < 0 = early).
const INT = {
  perfect: 0.12, early: 0.32, late: 0.22,   // PERFECT window is +-0.12 s; odds taper to nothing at 0.32 s early / 0.22 s late
  close: 1.5, reach: 3.2,                    // full odds within 1.5 yd of the catch point, tapering to nothing at 3.2 yd
  minTTA: 0.6,                               // presses more than 0.6 s before arrival don't lunge (they just confirm your man)
  lungeT: 0.28, lungeV: 9, lateReach: 0.9,   // the lunge: 0.28 s burst at up to 9 yd/s; a late (in-the-catch) lunge reaches 0.9 yd
  human: [0.85, 0.78, 0.7], pvp: 0.78,       // perfect + close INT odds for a human defender (vs Rookie / Pro / All-Pro QBs, online)
  passive: 0.1,                              // human defender who never pressed but is closest to the catch
  cpu: [0.35, 0.45, 0.55], cpuSig: [0.24, 0.16, 0.1], // CPU defenders: base odds and timing error (s) by difficulty
};
function intTiming(e) { const a = Math.abs(e), edge = e < 0 ? INT.early : INT.late; if (a <= INT.perfect) return 1; if (a >= edge) return 0; return 1 - 0.8 * (a - INT.perfect) / (edge - INT.perfect); }
function intDist(d) { return d <= INT.close ? 1 : d >= INT.reach ? 0 : 1 - (d - INT.close) / (INT.reach - INT.close); }
function intOdds(e, d, base, recvCloser) { return base * intTiming(e) * intDist(d) * (recvCloser ? 0.7 : 1); }
function intGrade(e) { return Math.abs(e) <= INT.perfect ? 'PERFECT' : e < 0 ? 'EARLY' : 'LATE'; }
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = Math.hypot;

const Sim = (() => {
  let G = null;
  const dirOf = t => t === 0 ? 1 : -1;
  const teamOf = i => i < 7 ? 0 : 1;
  const P = i => G.pl[i];
  const teamPl = t => G.pl.slice(t * 7, t * 7 + 7);
  const goalX = t => t === 0 ? 110 : 10;   // the goal line team t attacks
  const ownYd = (t, x) => t === 0 ? x - 10 : 110 - x;
  const sk = t => G.human[t] ? SKILL[1] : SKILL[G.opts.diff];
  function ev(n, x, y, extra) { G.evSeq++; G.ev.push(Object.assign({ s: G.evSeq, n, x: x == null ? null : +x.toFixed(1), y: y == null ? null : +y.toFixed(1) }, extra || {})); if (G.ev.length > 16) G.ev.shift(); }
  function banner(t, sub, col, dur) { G.bannerSeq++; G.banner = { t, sub: sub || '', c: col || '#fff', id: G.bannerSeq, d: dur || 2.2 }; }

  function newGame(opts) {
    G = {
      opts: Object.assign({ diff: 1, half: 150 }, opts || {}), human: (opts && opts.human) || [true, false],
      phase: 'select', t: 0, clock: (opts && opts.half) || 150, half: 1, score: [0, 0], off: 0, down: 1, togo: 10, los: 35, ballY: MID_Y, flip: 1,
      pl: [], ball: { x: 35, y: MID_Y, z: 0.3, vx: 0, vy: 0, vz: 0, st: 'dead', holder: -1, kind: '', t: 0, T: 0, tgt: -1 },
      picks: [null, null], pflip: [false, false], formFlip: [false, false], lag: [0, 0], pend: [false, false], selT: 0, ctl: [3, 10], aim: [-1, -1], wrap: null,
      ev: [], evSeq: 0, banner: null, bannerSeq: 0, calls: null, kind: '', over: false, thrown: false, crossed: false, run: false, runT: 0,
      playT: 0, cv: { x: 0, y: 0 }, edgeI: -1, edgeSide: 1, deepI: -1, scram: false, keyBite: 1,
      key: [0, 1].map(() => ({ run: 0, out: 0, scr: 0, side: 0, n: 0, said: '' })), result: null, gid: Math.floor(Math.random() * 1e9), excite: 0, lastGain: 0, drive: 0, hikeT: 0, stats: { plays: 0, tds: [0, 0] },
    };
    for (let i = 0; i < 14; i++) G.pl.push({ i, team: teamOf(i), slot: i % 7, role: '', num: 0, x: 0, y: 0, vx: 0, vy: 0, fa: 0, st: 'ok', lat: 1, recov: 0, stT: 0, eng: -1, engT: 0, shedNeed: 2, noEng: 0, maxv: 7, as: null, wp: 0, route: null, tcd: 0, imm: 0, dv: 0, lastShed: -1 });
    setPossession(0, 35, false);
    placeFormation(true);
    beginSelect();
    return G;
  }
  function setPossession(team, x, keepBall) {
    G.off = team; G.los = clamp(x, 11, 109); G.down = 1; G.togo = 10; setFd();
    if (!keepBall) G.ballY = MID_Y;
  }
  function setFd() {
    const d = dirOf(G.off); let fd = G.los + d * G.togo;
    if ((fd - goalX(G.off)) * d >= 0) { fd = goalX(G.off); G.togo = Math.abs(fd - G.los); G.goalToGo = true; } else G.goalToGo = false;
    G.fd = fd;
  }
  function roleOf(p) { return p.team === G.off ? OFF_ROLE[p.slot] : DEF_ROLE[p.slot]; }
  /** lateral mirror for a team: the wide-side flip times that team's own FLIP call (once it may be shown) */
  const latOf = t => G.flip * (G.formFlip[t] ? -1 : 1);
  function formPos(p) {
    const d = dirOf(G.off), f = p.team === G.off ? OFF_FORM[p.slot] : DEF_FORM[p.slot];
    return { x: G.los + d * f[0], y: clamp(G.ballY + f[1] * latOf(p.team), 1, FIELD_W - 1) };
  }
  function placeFormation(snapNow) {
    G.flip = G.ballY > MID_Y + 0.5 ? -1 : 1;
    for (const p of G.pl) {
      p.role = roleOf(p); p.num = p.team === G.off ? OFF_NUM[p.slot] : DEF_NUM[p.slot];
      p.maxv = BASE_V[p.role] * sk(p.team).spd;
      if (snapNow) { const f = formPos(p); p.x = f.x; p.y = f.y; p.vx = p.vy = 0; }
    }
  }
  function resetPlayers() {
    for (const p of G.pl) { p.eng = -1; p.engT = 0; p.as = null; p.route = null; p.wp = 0; p.tcd = 0; p.imm = 0; p.noEng = 0; p.lastShed = -1; p.jukeT = -9; p.mashT = -9; if (p.st === 'dive') { p.st = 'down'; p.stT = 0.6; } }
  }
  function beginSelect() {
    G.phase = 'select'; G.t = 0; G.selT = 14; G.picks = [null, null]; G.pend = [false, false]; G.calls = null; G.kind = ''; G.wrap = null;
    G.ball.st = 'dead'; G.ball.holder = -1; G.ball.x = G.los; G.ball.y = G.ballY; G.ball.z = 0.15; G.thrown = false; G.crossed = false; G.run = false;
    G.pflip = [false, false]; G.formFlip = [false, false];
    resetPlayers(); placeFormation(false);
    for (let t = 0; t < 2; t++) if (!G.human[t]) { G.picks[t] = cpuPick(t); G.pflip[t] = cpuFlip(t, G.picks[t]); G.pend[t] = true; }
    { const k = G.key[G.off], dh = G.human[1 - G.off], tag = k.scr > 0.55 ? 'THE QB SCRAMBLE' : k.out > 0.6 ? 'THE OUTSIDE RUN' : k.run > 0.7 ? 'THE RUN' : '';
      if (tag && tag !== k.said && !dh && G.human[G.off] && k.n >= 3) { k.said = tag; banner('DEFENSE KEYS ON ' + tag, 'Mix in a pass to keep them honest', '#8fd3ff', 2.4); }
      else if (!tag) k.said = ''; }
    const d = dirOf(G.off);
    G.ctl[G.off] = G.off * 7 + 3;
    const def = 1 - G.off; G.ctl[def] = def * 7 + 3;
  }
  /** a side locks in its call (host / CPU game) */
  function pick(team, id, flip) {
    if (G.phase !== 'select' || G.picks[team]) return false;
    const list = team === G.off ? offenseChoices() : DEFENSE;
    if (!list.some(p => p.id === id)) id = list[0].id;
    G.picks[team] = id; G.pflip[team] = !!flip; G.pend[team] = true; return true;
  }
  /** the CPU flips its call now and then (never kicks) */
  function cpuFlip(team, id) { const p = PLAY_BY_ID[id]; return !!p && p.kind !== 'punt' && p.kind !== 'fg' && Math.random() < 0.4; }
  function lock(team) { if (G.phase === 'select') G.pend[team] = true; }
  function offenseChoices() {
    const kickDist = Math.abs(goalX(G.off) - G.los) + 17;
    return OFFENSE.filter(p => p.id !== 'fg' || kickDist <= 57);
  }
  function cpuPick(team) {
    const off = team === G.off, togo = G.togo, toGoal = Math.abs(goalX(G.off) - G.los), kick = toGoal + 17;
    if (off) {
      const late = G.half === 2 && G.clock < 20, behind = G.score[team] < G.score[1 - team];
      if (G.down === 4 && !(late && behind)) {
        if (kick <= 47 && !(togo <= 2 && toGoal < 5)) return 'fg';
        if (togo > 2 || ownYd(team, G.los) < 50) return 'punt';
      }
      if (late && !behind && G.score[team] - G.score[1 - team] <= 2 && kick <= 45) return 'fg';
      const w = togo > 7 ? { dive: 1, sweep: 1.5, slants: 3, post: 3, bomb: 2, screen: 1.5 } : togo <= 3 ? { dive: 4, sweep: 2.5, slants: 2, post: 1, bomb: 0.6, screen: 1 } : { dive: 2.5, sweep: 2, slants: 2.5, post: 2, bomb: 1.2, screen: 1.5 };
      if (toGoal < 12) w.bomb = 0.3;
      return wpick(w);
    }
    const w = togo > 8 ? { man: 2, zone: 3, blitz: 1.5, stuff: 0.6, prevent: 1.5 } : togo <= 3 ? { man: 2, zone: 1, blitz: 2.5, stuff: 3.5, prevent: 0.2 } : { man: 3, zone: 2.5, blitz: 2, stuff: 1.8, prevent: 0.6 };
    if (G.half === 2 && G.clock < 30 && G.score[team] > G.score[1 - team]) w.prevent += 3;
    // keyed on the run: crash it if it goes inside, keep everything in front (zone, no blitz) if it bounces outside,
    // and send pressure with a spy at a scrambling QB
    const K = keyOf(team); w.stuff += 3 * K.run * (1 - K.out); w.zone += 2.5 * K.out; w.man += K.run + 1.5 * K.scr;
    w.blitz = Math.max(0.2, w.blitz + 1.5 * K.scr - 1.6 * K.out); w.prevent *= 1 - 0.6 * K.run;
    return wpick(w);
  }
  function wpick(w) { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; }

  /* ---------------- the snap ---------------- */
  function snap() {
    const op = PLAY_BY_ID[G.picks[G.off]], dp = PLAY_BY_ID[G.picks[1 - G.off]];
    G.phase = 'live'; G.t = 0; G.playT = 0; G.kind = op.kind; G.op = op; G.dp = dp;
    G.calls = [op.name + (G.pflip[G.off] ? ' (FLIP)' : ''), dp.name + (G.pflip[1 - G.off] ? ' (FLIP)' : '')];
    G.thrown = false; G.crossed = false; G.run = false; G.runT = 0; G.wrap = null; G.result = null; G.stats.plays++;
    G.scram = false; G.caught = false; G.edgeI = G.deepI = -1; G.cv.x = G.cv.y = 0;
    const K = keyOf(1 - G.off); G.keyBite = 1 - 0.35 * K.run; // a defense that has seen your runs doesn't bite on fakes as easily
    const d = dirOf(G.off), off = G.off, def = 1 - off;
    // the FLIP calls take effect: both formations line up mirrored (online this is the first time anyone sees them)
    G.formFlip = G.pflip.slice();
    const flO = latOf(off), flD = latOf(def), cross = flO !== flD;
    const W = (f, l, fl) => ({ x: G.los + d * f, y: clamp(G.ballY + l * fl, 0.8, FIELD_W - 0.8) });
    for (const p of G.pl) {
      const fp = formPos(p); p.x = fp.x; p.y = fp.y; p.vx = p.vy = 0;
      p.as = null; p.route = null; p.wp = 0; p.lat = p.team === off ? flO : flD; p.recov = 0; p.itK = '';
      const fl = p.lat;
      if (p.team === off) {
        const r = op.r && op.r[p.slot];
        if (p.slot <= 2) p.as = r === 'pull' ? 'pull' : 'blk';
        else if (p.slot === 3) { p.as = 'qb'; p.route = (op.qb || [[-5, 0]]).map(q => W(q[0], q[1], fl)); }
        else if (r === 'blk') p.as = 'blk';
        else if (Array.isArray(r)) { p.as = 'route'; p.route = r.map(q => W(q[0], q[1], fl)); }
        else p.as = p.slot === 4 ? 'blk' : 'route', p.route = p.route || [W(OFF_FORM[p.slot][0] + 20, OFF_FORM[p.slot][1], fl)];
      } else {
        let a = dp.a[p.slot]; const K = keyOf(def);
        if (p.slot === 3 && K.scr > 0.3 && (a[0] === 'zone' || a[0] === 'man') && !(G.human[def])) a = ['spy']; // he keeps scrambling: the MLB spies the QB
        p.as = a[0]; p.asArg = a;
        if (a[0] === 'zone') p.zone = W(a[1] - (p.role === 'S' ? 6 * K.run : 0), a[2], fl); // a safety who has seen the run cheats down
        // man coverage is by side: when only one team flipped, the corners take the receiver now on their side
        if (a[0] === 'man') p.manT = off * 7 + (cross && a[1] >= 5 ? 11 - a[1] : a[1]);
      }
    }
    const qb = P(off * 7 + 3), c = P(off * 7);
    G.ctl[off] = qb.i;
    if (!G.human[def] || G.ctl[def] < 0 || teamOf(G.ctl[def]) !== def) G.ctl[def] = def * 7 + 3;
    // the snap: ball flies from the center to the QB
    const b = G.ball; Object.assign(b, { x: c.x, y: c.y, z: 0.25, st: 'air', kind: 'snap', holder: -1, t: 0, T: 0.24, sx: c.x, sy: c.y, sz: 0.25, tx: qb.x, ty: qb.y, tz: 1.1, tgt: qb.i, spin: 0, hold: 0, lunge: null, arr: null });
    ev('hike', G.los, G.ballY);
    if (op.kind === 'punt' || op.kind === 'fg') { G.special = { k: op.kind, at: 0.85 }; }
    else G.special = null;
    G.aim[off] = -1;
  }

  /* ---------------- helpers ---------------- */
  const carrier = () => G.ball.st === 'held' ? P(G.ball.holder) : null;
  function moveTo(p, tx, ty, speed, stopR) {
    const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy);
    if (d < (stopR || 0.05)) return { x: 0, y: 0 };
    const s = Math.min(speed, d * 4.2);
    return { x: dx / d * s, y: dy / d * s };
  }
  /** record what the AI is about to do (for the HELMET CAM's intent cues): kind, target point, target player; returns r unchanged */
  function I(p, k, x, y, o, r) { p.itK = k; p.itX = x; p.itY = y; p.itO = o; return r; }
  function pursue(p, q, speed) {
    const d = hyp(q.x - p.x, q.y - p.y), lead = clamp(d / Math.max(1, speed) * 0.75, 0, 1.3);
    return moveTo(p, q.x + q.vx * lead, q.y + q.vy * lead, speed);
  }
  /** a ball carrier's legs: 1 fresh, down to RUN.tireMin on a long run */
  function tire(p) { return 1 - (1 - RUN.tireMin) * clamp(((p.carryT || 0) - RUN.tireAfter) / RUN.tireSpan, 0, 1); }
  /** earliest point where a chaser at speed s can meet a runner at (c) moving with velocity v; null if he can't */
  function meetPoint(p, c, v, s) {
    const rx = c.x - p.x, ry = c.y - p.y, a = v.x * v.x + v.y * v.y - s * s, b = 2 * (rx * v.x + ry * v.y), cc = rx * rx + ry * ry;
    let t = -1;
    if (Math.abs(a) < 1e-6) t = b < 0 ? -cc / b : -1;
    else { const disc = b * b - 4 * a * cc; if (disc >= 0) { const q = Math.sqrt(disc), t1 = (-b - q) / (2 * a), t2 = (-b + q) / (2 * a); t = Math.min(t1 > 0 ? t1 : 1e9, t2 > 0 ? t2 : 1e9); if (t > 1e8) t = -1; } }
    return t > 0 && t < 6 ? { x: c.x + v.x * t, y: c.y + v.y * t, t } : null;
  }
  /** the defense's keys on this offense's habits (0..1), weighted by how well the defending side learns */
  function keyOf(def) { const k = G.key[1 - def], L = sk(def).learn; return { run: k.run * L, out: k.out * L, scr: k.scr * L, side: k.side * L }; }
  function eligible(team) { return [4, 5, 6].map(s => P(team * 7 + s)); }
  function openness(r, team) {
    let m = 99; for (const q of teamPl(1 - team)) { if (q.st === 'down') continue; m = Math.min(m, hyp(q.x - r.x, q.y - r.y)); } return m;
  }
  function leadPoint(qb, r) {
    let tx = r.x, ty = r.y, T = 0.5;
    for (let k = 0; k < 3; k++) { const dist = hyp(tx - qb.x, ty - qb.y); T = 0.25 + dist / (17 + dist * 0.22); tx = r.x + r.vx * T; ty = r.y + r.vy * T; }
    return { x: clamp(tx, 0.5, 119.5), y: clamp(ty, 0.6, FIELD_W - 0.6), T };
  }
  function throwTo(qb, r, err) {
    const L = leadPoint(qb, r), b = G.ball;
    const ex = err ? rand(-err, err) : 0, ey = err ? rand(-err, err) : 0;
    Object.assign(b, { st: 'air', kind: 'pass', holder: -1, t: 0, T: L.T, sx: qb.x, sy: qb.y, sz: 2.0, tx: L.x + ex, ty: L.y + ey, tz: 1.25, tgt: r.i, from: qb.i, x: qb.x, y: qb.y, z: 2.0, hold: 0, lunge: null, arr: null });
    G.thrown = true; G.ctl[qb.team] = r.i; qb.throwT = 0.35;
    ev('throw', qb.x, qb.y);
  }
  function giveBall(p, how) {
    const b = G.ball; b.st = 'held'; b.holder = p.i; b.kind = ''; b.tgt = -1;
    G.ctl[p.team] = p.i; p.carryT = 0; G.cv.x = p.vx; G.cv.y = p.vy;
    if (p.team !== G.off || p.role !== 'QB') { G.run = true; }
    if (how) ev(how, p.x, p.y);
  }

  /* ---------------- AI: offense ---------------- */
  function aiOffense(p, out) {
    const d = dirOf(G.off), c = carrier(), b = G.ball;
    // ball in the air to me: go get it
    if (b.st === 'air' && b.tgt === p.i && (b.kind === 'pass' || b.kind === 'pitch')) return I(p, 'catch', b.tx, b.ty, -1, moveTo(p, b.tx, b.ty, p.maxv, 0.15));
    if (b.st === 'loose') return I(p, 'ball', b.x, b.y, -1, moveTo(p, b.x, b.y, p.maxv));
    if (c === p) return aiCarrier(p);
    // someone else has it downfield: block for them
    const downfield = c && c.team === p.team && (c.role !== 'QB' || G.crossed);
    if (p.as === 'qb') {
      if (c === p) return aiCarrier(p);
      const r = p.route; if (r && p.wp < r.length) { const q = r[p.wp]; if (hyp(q.x - p.x, q.y - p.y) < 0.5) p.wp++; return I(p, 'qb', q.x, q.y, -1, moveTo(p, q.x, q.y, p.maxv * 0.8)); }
      return I(p, 'qb', p.x, p.y, -1, { x: 0, y: 0 });
    }
    if (p.as === 'blk' || p.as === 'pull' || (downfield && p.as === 'route' && G.run && c !== p)) return aiBlock(p, c);
    if (p.as === 'route') {
      const r = p.route;
      if (p.wp < r.length) {
        const q = r[p.wp]; if (hyp(q.x - p.x, q.y - p.y) < 0.7) p.wp++;
        if (p.wp < r.length) return I(p, 'route', r[p.wp].x, r[p.wp].y, -1, moveTo(p, r[p.wp].x, r[p.wp].y, p.maxv * 0.97));
      }
      // route finished: deep routes keep running, short ones settle and wait
      const L = r[r.length - 1], Pr = r.length > 1 ? r[r.length - 2] : { x: L.x - d * 5, y: L.y };
      const len = hyp(L.x - Pr.x, L.y - Pr.y), deep = Math.abs(L.x - G.los) > 18;
      if (deep && len > 0) return I(p, 'route', p.x + (L.x - Pr.x) / len * 8, p.y + clamp((L.y - Pr.y) / len, -0.7, 0.7) * 6, -1, { x: (L.x - Pr.x) / len * p.maxv * 0.85, y: clamp((L.y - Pr.y) / len, -0.7, 0.7) * p.maxv * 0.6 });
      return I(p, 'route', p.x, p.y, -1, { x: 0, y: 0 });
    }
    return { x: 0, y: 0 };
  }
  function aiBlock(p, c) {
    const qb = c || P(G.off * 7 + 3), d = dirOf(G.off), def = 1 - G.off;
    if (p.eng >= 0) return I(p, 'engaged', p.x, p.y, p.eng, { x: 0, y: 0 });
    // choose a defender: nearest threat to the ball carrier that nobody else is blocking
    let best = null, bs = 1e9;
    for (const q of teamPl(def)) {
      if (q.st === 'down' || (q.eng >= 0 && q.eng !== p.i) || q.i === p.lastShed) continue;
      const toBall = hyp(q.x - qb.x, q.y - qb.y), toMe = hyp(q.x - p.x, q.y - p.y);
      let s = toMe * 1.0 + toBall * 0.7;
      if (p.as === 'blk' && p.slot <= 2 && !G.run && (q.x - G.los) * d > 7) s += 30; // linemen: stay home, take rushers
      if (s < bs) { bs = s; best = q; }
    }
    if (p.as === 'pull' && G.t < 1.6) { // lead the sweep
      const rb = P(G.off * 7 + 4), lx = rb.x + d * 3, ly = rb.y + (rb.y > G.ballY ? 2 : -2); return I(p, 'lead', lx, ly, -1, moveTo(p, lx, ly, p.maxv * 1.05));
    }
    if (!best) return I(p, '', 0, 0, -1, { x: 0, y: 0 });
    const nx = qb.x - best.x, ny = qb.y - best.y, n = hyp(nx, ny) || 1;
    const gx = best.x + nx / n * 0.85, gy = best.y + ny / n * 0.85;
    return I(p, 'block', gx, gy, best.i, moveTo(p, gx, gy, p.maxv));
  }
  function aiCarrier(p) {
    const d = dirOf(p.team), def = 1 - p.team;
    // QB with the ball before throwing
    if (p.role === 'QB' && p.team === G.off && !G.crossed && !G.thrown && G.kind === 'pass') return aiQB(p);
    if (p.role === 'QB' && p.team === G.off && (G.kind === 'run') && !G.run) {
      const r = p.route; if (r && p.wp < r.length) { const q = r[p.wp]; if (hyp(q.x - p.x, q.y - p.y) < 0.5) p.wp++; return I(p, 'qb', q.x, q.y, -1, moveTo(p, q.x, q.y, p.maxv * 0.6)); }
      return I(p, 'qb', p.x, p.y, -1, { x: 0, y: 0 });
    }
    // runner: head for the end zone, steer away from tacklers, keep off the sideline
    let vx = d * 1.0, vy = 0;
    if (p.route && p.as === 'route' && p.wp < p.route.length && G.kind === 'run' && G.t < 2.4) { // follow the designed run path first
      const q = p.route[p.wp]; if (hyp(q.x - p.x, q.y - p.y) < 1.0) p.wp++;
      if (p.wp < p.route.length) { const r = p.route[p.wp]; const n = hyp(r.x - p.x, r.y - p.y) || 1; vx = (r.x - p.x) / n; vy = (r.y - p.y) / n; }
    }
    for (const q of teamPl(def)) {
      if (q.st === 'down' || q.eng >= 0) continue;
      const dx = p.x - q.x, dy = p.y - q.y, dist = hyp(dx, dy); if (dist > 9) continue;
      const ahead = (q.x - p.x) * d > -1.5 ? 1 : 0.35, w = ahead * 2.2 / Math.max(0.6, dist * dist) * 2.2;
      vy += dy / dist * w * 1.1; vx += dx / dist * w * 0.3;
    }
    if (p.y < 4) vy += (4 - p.y) * 0.35; if (p.y > FIELD_W - 4) vy -= (p.y - FIELD_W + 4) * 0.35;
    if (vx * d < 0.25) vx = d * 0.25;
    const n = hyp(vx, vy) || 1, sp = p.maxv * (p.role === 'QB' ? 1 : 0.97) * tire(p); return I(p, 'run', p.x + vx / n * 6, p.y + vy / n * 6, -1, { x: vx / n * sp, y: vy / n * sp });
  }
  function aiQB(p) {
    const s = sk(p.team), d = dirOf(p.team), def = 1 - p.team;
    const r = p.route; let mv = { x: 0, y: 0 }; I(p, 'qb', p.x, p.y, -1);
    if (r && p.wp < r.length) { const q = r[p.wp]; if (hyp(q.x - p.x, q.y - p.y) < 0.4) p.wp++; mv = moveTo(p, q.x, q.y, p.maxv * 0.85); I(p, 'qb', q.x, q.y, -1); }
    // pressure?
    let near = 99, nq = null; for (const q of teamPl(def)) { if (q.st === 'down' || q.eng >= 0) continue; const dd = hyp(q.x - p.x, q.y - p.y); if (dd < near) { near = dd; nq = q; } }
    if (G.human[p.team]) return mv; // (only reached for a human team's QB before control is applied)
    const t = G.t, read = p.read || (p.read = s.read + rand(-0.3, 0.5));
    if (t > 0.55) {
      let best = null, bs = -1e9;
      for (const e of eligible(p.team)) {
        if (e.st !== 'ok') continue;
        const L = leadPoint(p, e), o = openness({ x: L.x, y: L.y }, p.team), gain = (L.x - G.los) * d;
        const sc = Math.min(o, 6) * 1.0 + gain * 0.07 - (o < 1.6 ? 5 : 0) + (G.op.screen && e.slot === 4 && t > 1.6 ? 3 : 0) + (G.togo > 8 && gain < G.togo ? -1.2 : 0);
        if (sc > bs) { bs = sc; best = e; }
      }
      const pressure = near < 2.4;
      if (best && ((t > read && bs > 3.2) || (t > read + 1.0 && bs > 1.8) || (pressure && bs > 2) || t > 3.8)) { throwTo(p, best, s.acc); return { x: 0, y: 0 }; }
      if (pressure && nq) { const ax = p.x - nq.x, ay = p.y - nq.y, n = hyp(ax, ay) || 1; return I(p, 'scram', p.x + ax / n * 5, p.y + ay / n * 5, nq.i, { x: ax / n * p.maxv, y: ay / n * p.maxv }); } // scramble away
    }
    return mv;
  }

  /* ---------------- AI: defense ---------------- */
  function aiDefense(p) {
    const s = sk(p.team), off = G.off, d = dirOf(off), c = carrier(), b = G.ball;
    if (p.eng >= 0) return I(p, 'engaged', p.x, p.y, p.eng, { x: 0, y: 0 });
    if (b.st === 'loose') return I(p, 'ball', b.x, b.y, -1, moveTo(p, b.x, b.y, p.maxv));
    if (G.special) return { x: 0, y: 0 };
    // ball in the air: break on it if I can get there
    if (b.st === 'air' && b.kind === 'pass') {
      const left = Math.max(0, b.T - b.t), dist = hyp(b.tx - p.x, b.ty - p.y);
      if (dist < left * p.maxv * 1.05 + 1.2 && G.t - b.launch > s.react) return I(p, 'ball', b.tx, b.ty, b.tgt, moveTo(p, b.tx, b.ty, p.maxv));
      const r = P(b.tgt); return I(p, 'cover', r.x, r.y, r.i, pursue(p, r, p.maxv));
    }
    if (c && c.team !== off) { // interception return: everybody on the original offense tackles, we block... just pursue roles swap
      return { x: 0, y: 0 };
    }
    // run (or scramble / catch) detected: pursue after the reaction delay
    const K = keyOf(p.team), react = s.react * (p.as === 'zone' ? 1.3 : 1) * (1 - 0.25 * K.run - 0.3 * K.out);
    if (G.run && c && G.t - G.runT > react) return pursueRun(p, c, s);
    if (G.scram && c && c.role === 'QB' && p.as !== 'man' && G.t - G.scram > react) return pursueRun(p, c, s);
    const qb = P(off * 7 + 3);
    switch (p.as) {
      case 'rush': {
        const tgt = c || qb;
        if (p.role === 'S' && G.t < 0.75) return I(p, 'read', p.x - d * 3, p.y, -1, moveTo(p, p.x - d * 3, p.y, p.maxv * 0.35)); // a safety blitz is delayed: he reads run/pass first, so a run still has someone over the top
        if (p.role === 'DE' && G.t > 0.25 && (G.kind === 'pass' || K.out > 0.35)) { // ends rush with outside leverage (vs the pass, or once he keeps bouncing runs outside): no escaping around them
          // (that leaves the inside softer: a defense keyed on the edge can be gashed up the middle)
          const side = Math.sign(p.y - G.ballY) || 1, w = 1.4 + 2.2 * K.out, dd = hyp(tgt.x - p.x, tgt.y - p.y);
          if (dd > 2.2) { const cx = tgt.x + tgt.vx * 0.3, cy = tgt.y + tgt.vy * 0.3 + side * Math.min(w, dd * 0.5); return I(p, 'contain', cx, cy, tgt.i, moveTo(p, cx, cy, p.maxv)); }
        }
        return I(p, 'rush', tgt.x, tgt.y, tgt.i, pursue(p, tgt, p.maxv * (G.t < 0.25 ? 0.6 : 1)));
      }
      case 'spy': { // mirror the QB from 4.5 yd off the ball, then come up the moment he takes off
        if (G.t < 0.4) return I(p, 'spy', p.x, p.y, qb.i, { x: 0, y: 0 });
        return I(p, 'spy', G.los + d * 4.5, qb.y + qb.vy * 0.25, qb.i, moveTo(p, G.los + d * 4.5, qb.y + qb.vy * 0.25, p.maxv));
      }
      case 'fill': {
        if (G.kind === 'run' && c) return I(p, 'fill', c.x, c.y, c.i, pursue(p, c, p.maxv));
        if (G.t < 1.1) { const fx = G.los + d * 0.8, fy = G.ballY + (p.slot === 6 ? 3 : -1) * (p.lat || 1); return I(p, 'fill', fx, fy, -1, moveTo(p, fx, fy, p.maxv)); }
        const ft = c || qb; return I(p, 'fill', ft.x, ft.y, ft.i, pursue(p, ft, p.maxv));
      }
      case 'man': {
        const r = P(p.manT), cush = p.asArg[2] * (G.t < 1 ? 1 : 0.6), cov = s.cover;
        const ex = r.x + r.vx * (0.15 + 0.3 * cov) + d * cush, ey = r.y + r.vy * (0.15 + 0.3 * cov);
        return I(p, 'man', ex, ey, r.i, moveTo(p, ex, ey, p.maxv * (r.role === 'RB' && p.role === 'LB' ? 0.95 : 1.0), 0.1));
      }
      case 'zone': {
        const Z = p.zone; let best = null, bd = 1e9;
        for (const r of eligible(off)) { const dz = hyp(r.x - Z.x, r.y - Z.y); if (dz < 9.5 && dz < bd) { bd = dz; best = r; } }
        if (best) { const gx = best.x + best.vx * 0.3 + d * 1.6, gy = best.y + best.vy * 0.3, zx = gx * 0.75 + Z.x * 0.25, zy = gy * 0.8 + Z.y * 0.2; return I(p, 'zone', zx, zy, best.i, moveTo(p, zx, zy, p.maxv)); }
        return I(p, 'zone', Z.x, Z.y, -1, moveTo(p, Z.x, Z.y, p.maxv * 0.85));
      }
    }
    return { x: 0, y: 0 };
  }
  /** who sets the edge and who stays over the top this step (from the defense's point of view) */
  function assignPursuit(c) {
    const d = dirOf(c.team), side = Math.abs(G.cv.y) > 1.2 ? Math.sign(G.cv.y) : (Math.sign(c.y - G.ballY) || (c.y < MID_Y ? -1 : 1));
    let e = null, es = -1e9, dp = null, ds = -1e9;
    for (const q of teamPl(1 - c.team)) {
      if (q.st === 'down' || q.eng >= 0 || (G.human[q.team] && G.ctl[q.team] === q.i)) continue;
      const ahead = (q.x - c.x) * d; if (ahead < -1) continue;
      const out = (q.y - c.y) * side - hyp(q.x - c.x, q.y - c.y) * 0.25;
      if (out > es) { es = out; e = q; }
      const deep = ahead + (q.role === 'S' ? 4 : 0) - Math.abs(q.y - c.y) * 0.3;
      if (deep > ds) { ds = deep; dp = q; }
    }
    if (dp === e) { // the same man can't do both: the next-deepest stays home
      dp = null; ds = -1e9;
      for (const q of teamPl(1 - c.team)) { if (q === e || q.st === 'down' || q.eng >= 0 || (G.human[q.team] && G.ctl[q.team] === q.i)) continue; const ahead = (q.x - c.x) * d; if (ahead < -1) continue; const deep = ahead + (q.role === 'S' ? 4 : 0) - Math.abs(q.y - c.y) * 0.3; if (deep > ds) { ds = deep; dp = q; } }
    }
    G.edgeI = e ? e.i : -1; G.edgeSide = side; G.deepI = dp ? dp.i : -1;
  }
  /** run pursuit: take an intercept angle (not his back), one man sets the edge, one stays over the top, everybody
      else converges; a man who can't catch him races to where he'll cross the goal line. CPU tacklers in range dive. */
  function pursueRun(p, c, s) {
    const d = dirOf(c.team), goal = goalX(c.team), spd = p.maxv * s.chase, dist = hyp(c.x - p.x, c.y - p.y), K = keyOf(p.team);
    const closing = ((p.vx - c.vx) * (c.x - p.x) + (p.vy - c.vy) * (c.y - p.y)) / (dist || 1);
    // in his dive window (the HELMET CAM flashes "!"): he may leave his feet any step now
    const diveOk = p.st === 'ok' && dist > 1.05 && dist < 2.1 && closing < 3.5 && c.imm <= 0 && !G.wrap;
    if (diveOk) { I(p, 'dive', c.x, c.y, c.i); if (Math.random() < s.dive * 3 * STEP) { dive(p, c); return { x: p.vx, y: p.vy }; } }
    if (dist < 2.4) { const kx = c.x + G.cv.x * 0.12, ky = c.y + G.cv.y * 0.12; if (!diveOk) I(p, 'close', kx, ky, c.i); return moveTo(p, kx, ky, spd); }
    // where is he going? his recent heading, leaned toward the goal line he wants
    const top = (G.human[c.team] && G.ctl[c.team] === c.i ? BASE_V[c.role] * RUN.top * HUMAN_TOP : c.maxv) * tire(c);
    const vm = Math.max(hyp(G.cv.x, G.cv.y), top * 0.8), v = { x: G.cv.x * 0.7 + d * vm * 0.3, y: G.cv.y * 0.7 };
    const m = meetPoint(p, c, v, spd);
    let tx, ty;
    if (m) { tx = m.x; ty = m.y; }
    else { const tg = clamp((goal - c.x) * d / Math.max(3, v.x * d), 0, 6); tx = goal - d * 1.5; ty = c.y + v.y * tg; } // can't catch him: cut him off at the goal line
    if ((tx - goal) * d > 0) { const k = (goal - c.x) / ((tx - c.x) || 1e-6); tx = goal; ty = c.y + (ty - c.y) * clamp(k, 0, 1); }
    let kind = m ? 'pursue' : 'cutoff';
    // lesser defenders take flatter angles (they aim a little behind the ideal spot, up to ~1 yd for a rookie)
    { const L = hyp(tx - c.x, ty - c.y) || 1, lag = (1 - s.angle) * Math.min(3, L * 0.25); tx -= (tx - c.x) / L * lag; ty -= (ty - c.y) / L * lag; }
    if (p.i === G.edgeI && dist > 3) { ty += G.edgeSide * clamp(dist * 0.22, 0.8, 3) * (1 + K.out); kind = 'edge'; } // keep outside leverage: force him back inside
    if (p.i === G.deepI && (p.x - c.x) * d > 1) { const cush = clamp(dist * 0.4, 0, 6); if ((tx - c.x) * d < cush) tx = c.x + d * cush; kind = 'deep'; } // over the top
    return I(p, kind, tx, clamp(ty, 0.8, FIELD_W - 0.8), c.i, moveTo(p, tx, clamp(ty, 0.8, FIELD_W - 0.8), spd));
  }
  // interception return: the original offense becomes the tacklers
  function aiChase(p) { const c = carrier(); if (!c) return { x: 0, y: 0 }; return pursueRun(p, c, sk(p.team)); }

  /* ---------------- per-step update ---------------- */
  let inputs = [null, null];
  function update(dt, inp) {
    inputs = inp || [null, null];
    G.t += dt;
    G.excite = Math.max(0, G.excite - dt * 0.25);
    if (G.banner) { G.banner.d -= dt; if (G.banner.d <= 0) G.banner = null; }
    for (const p of G.pl) { if (p.throwT > 0) p.throwT -= dt; }
    switch (G.phase) {
      case 'select': updSelect(dt); break;
      case 'presnap': updPresnap(dt); break;
      case 'live': updLive(dt); break;
      case 'result': updResult(dt); break;
      case 'half': if (G.t > 3.5) { G.half = 2; G.clock = G.opts.half; setPossession(1, 85); G.ballY = MID_Y; placeFormation(true); beginSelect(); } else drift(dt); break;
      case 'over': drift(dt); break;
    }
  }
  function drift(dt) { for (const p of G.pl) { integrate(p, { x: 0, y: 0 }, dt, 10); } }
  function updSelect(dt) {
    G.selT -= dt;
    jog(dt, 1);
    if (G.selT <= -3) for (let t = 0; t < 2; t++) if (!G.picks[t]) { G.picks[t] = (t === G.off ? offenseChoices() : DEFENSE)[0].id; G.pend[t] = true; }
    if (G.picks[0] && G.picks[1]) {
      G.phase = 'presnap'; G.t = 0; G.hikeT = G.human[G.off] ? 5.5 : rand(1.3, 2.2);
      // vs the CPU the flipped formations line up now; online (opts.secret) they stay hidden until the snap
      if (!G.opts.secret) G.formFlip = G.pflip.slice();
    }
  }
  function jog(dt, k) { // walk everyone back to the huddle-less formation
    for (const p of G.pl) {
      if (p.st === 'down') { p.stT -= dt; if (p.stT <= 0) p.st = 'ok'; integrate(p, { x: 0, y: 0 }, dt, 14); continue; }
      p.st = 'ok';
      const f = formPos(p), dd = hyp(f.x - p.x, f.y - p.y);
      const v = moveTo(p, f.x, f.y, dd > 6 ? 7.5 * k : 4.2 * k, 0.04);
      integrate(p, v, dt, 12);
      if (dd < 0.08) { p.vx = p.vy = 0; p.fa = p.team === G.off ? (dirOf(G.off) > 0 ? 0 : Math.PI) : (dirOf(G.off) > 0 ? Math.PI : 0); }
    }
  }
  function updPresnap(dt) {
    G.clock = Math.max(0, G.clock - dt);
    // snap players into their spots quickly if they are not there yet
    for (const p of G.pl) { const f = formPos(p); const k = Math.min(1, dt * (G.t < 1 ? 3 : 8)); p.x += (f.x - p.x) * k; p.y += (f.y - p.y) * k; p.vx = p.vy = 0; p.st = 'ok'; p.fa = p.team === G.off ? (dirOf(G.off) > 0 ? 0 : Math.PI) : (dirOf(G.off) > 0 ? Math.PI : 0); }
    const di = inputs[1 - G.off];
    if (G.human[1 - G.off] && di && (di.aP || di.bP)) { const t = 1 - G.off, k = (G.ctl[t] - t * 7 + 1) % 7; G.ctl[t] = t * 7 + k; ev('switch'); }
    const inp = inputs[G.off];
    if (G.t > 0.7 && G.human[G.off] && inp && inp.aP) return snap();
    if (G.t > G.hikeT) snap();
  }
  function integrate(p, want, dt, acc) {
    const dvx = want.x - p.vx, dvy = want.y - p.vy, dm = hyp(dvx, dvy), a = acc * dt;
    if (dm <= a) { p.vx = want.x; p.vy = want.y; } else { p.vx += dvx / dm * a; p.vy += dvy / dm * a; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const sp = hyp(p.vx, p.vy);
    if (sp > 0.6) { const fa = Math.atan2(p.vy, p.vx); let df = fa - p.fa; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI; p.fa += df * Math.min(1, dt * 12); }
    p.x = clamp(p.x, -6, 126); p.y = clamp(p.y, -3.5, FIELD_W + 3.5);
  }

  function updLive(dt) {
    const b = G.ball, d = dirOf(G.off), off = G.off, def = 1 - off;
    G.playT += dt;
    G.clock = Math.max(0, G.clock - dt);
    // ---- special teams
    if (G.special) return updSpecial(dt);
    // ---- buttons
    for (let t = 0; t < 2; t++) {
      const inp = inputs[t]; if (!G.human[t] || !inp) continue;
      const c = carrier(), me = P(G.ctl[t]);
      if (inp.aP) {
        if (c && c.i === me.i) {
          if (me.role === 'QB' && t === off && G.kind === 'pass' && !G.thrown && !G.crossed) { const r = P(G.aim[t] >= 0 ? G.aim[t] : bestAim(me)); throwTo(me, r, 0.35); }
          else if (G.wrap && G.wrap.c === me.i) { if (G.t - (me.mashT || -9) > 0.15) { me.mashT = G.t; G.wrap.m -= RUN.mash / Math.max(1, G.wrap.tk.length * 0.8); ev('grunt', me.x, me.y); } }
          else if (me.imm <= 0 && G.t - (me.jukeT || -9) > RUN.juke.cd) juke(me);
        } else if (t !== (c ? c.team : off)) defPress(t, me, inp);
      }
      if (inp.bP) {
        if (c && c.i === me.i && me.role === 'QB' && !G.thrown && G.kind === 'pass') { cycleAim(t); }
        else if (!(c && c.team === t)) switchTo(t);
      }
    }
    // ---- QB handoffs / pitches / scramble detection
    const qb = P(off * 7 + 3), c0 = carrier();
    if (G.op.kind === 'run' && c0 === qb && !G.run) {
      const rb = P(off * 7 + 4);
      if (G.op.hand != null && G.t > 0.3 && (hyp(rb.x - qb.x, rb.y - qb.y) < 1.9 || G.t > 0.75)) { giveBall(rb, 'handoff'); G.runT = G.t; }
      if (G.op.pitch != null && G.t > 0.42) {
        const L = { x: rb.x + rb.vx * 0.4, y: rb.y + rb.vy * 0.4 };
        Object.assign(b, { st: 'air', kind: 'pitch', holder: -1, t: 0, T: 0.4, sx: qb.x, sy: qb.y, sz: 1.3, tx: L.x, ty: L.y, tz: 1.1, tgt: rb.i, launch: G.t });
        G.ctl[off] = rb.i; G.run = true; G.runT = G.t; ev('pitch', qb.x, qb.y);
      }
    }
    if (c0 && c0 === qb && !G.crossed && (qb.x - G.los) * d > 0.6) { G.crossed = true; qb.carryT = 0; if (!G.run) { G.run = true; G.runT = G.t; } }
    // a QB who leaves the pocket (wide, or stepping up at the line) is scrambling: the rush and the zones come up for him
    if (c0 && c0 === qb && G.kind === 'pass' && !G.thrown && !G.scram && G.t > 0.5 && (Math.abs(qb.y - G.ballY) > 6.5 || (qb.x - G.los) * d > -1.6)) G.scram = G.t;
    if (c0 && G.run) assignPursuit(c0);
    // aim (for a human QB)
    if (G.human[off] && c0 === qb && G.kind === 'pass' && !G.thrown && G.ctl[off] === qb.i) updAim(off, qb);
    // ---- desired velocities
    const wants = [];
    for (const p of G.pl) {
      let w; p.itK = '';
      if (p.st === 'down') { p.stT -= dt; if (p.stT <= 0 && G.phase === 'live') { p.st = 'ok'; } wants.push({ x: 0, y: 0 }); continue; }
      if (p.st === 'dive') { p.stT -= dt; if (p.stT <= 0) { p.st = 'down'; p.stT = 0.9; } wants.push({ x: p.vx, y: p.vy }); continue; }
      if (p.st === 'lunge') { p.stT -= dt; if (p.stT <= 0) { if (p.recov > 0) { p.st = 'stun'; p.stT = p.recov; p.recov = 0; } else p.st = 'ok'; } wants.push({ x: p.vx, y: p.vy }); continue; }
      const human = G.human[p.team] && G.ctl[p.team] === p.i && inputs[p.team];
      if (human) {
        const cm = inputs[p.team], role = p.role, f = (role === 'C' || role === 'LG' || role === 'RG' || role === 'DT') ? 0.86 : role === 'DE' ? 0.92 : 1;
        const top = BASE_V[role] * f * HUMAN_TOP;
        w = { x: cm.x * top, y: cm.y * top };
        if (p === c0) { // with the ball: capped at his position speed (and tiring), however hard the ball is spun
          const cap = BASE_V[role] * RUN.top * HUMAN_TOP * tire(p), m = hyp(w.x, w.y);
          if (m > cap) { w.x *= cap / m; w.y *= cap / m; }
        }
        p.hm = cm.m || 0;
      } else if (p.team === off) w = (c0 && c0.team !== off) ? aiChase(p) : aiOffense(p);
      else w = (c0 && c0.team === def) ? (c0 === p ? aiCarrier(p) : aiBlock(p, c0)) : aiDefense(p);
      if (p.st === 'stun') { p.stT -= dt; if (p.stT <= 0) p.st = 'ok'; w = { x: w.x * 0.3, y: w.y * 0.3 }; }
      if (p.burst > 0) { p.burst -= dt; w = { x: w.x * RUN.juke.boost, y: w.y * RUN.juke.boost }; }
      wants.push(w);
    }
    // ---- move (blocks and wrap-ups restrain)
    for (const p of G.pl) {
      const w = wants[p.i];
      if (p.st === 'dive' || p.st === 'lunge') { p.x += p.vx * dt; p.y += p.vy * dt; continue; }
      if (p.eng >= 0) continue;
      if (G.wrap && (G.wrap.c === p.i || G.wrap.tk.includes(p.i))) continue;
      const human = G.human[p.team] && G.ctl[p.team] === p.i;
      const acc = p === c0 ? (p.burst > 0 ? RUN.cutAcc : human ? RUN.acc : 14) : human ? 24 : 14;
      integrate(p, w, dt, p.st === 'down' ? 20 : acc);
    }
    { const c = carrier(); if (c) { c.carryT = (c.carryT || 0) + dt; const k = Math.min(1, dt * 5); G.cv.x += (c.vx - G.cv.x) * k; G.cv.y += (c.vy - G.cv.y) * k; } }
    updBlocks(dt, wants);
    updWrap(dt, wants);
    separate();
    if (G.phase !== 'live') return;
    updBall(dt);
    if (G.phase !== 'live') return;
    checkTackles();
    if (G.phase !== 'live') return;
    checkDead();
    for (const p of G.pl) { if (p.tcd > 0) p.tcd -= dt; if (p.imm > 0) p.imm -= dt; if (p.noEng > 0) p.noEng -= dt; }
  }
  function bestAim(qb) {
    let best = null, bs = -1e9; const d = dirOf(qb.team);
    for (const e of eligible(qb.team)) { if (e.st !== 'ok') continue; const L = leadPoint(qb, e); const s = Math.min(openness(L, qb.team), 6) + (L.x - G.los) * d * 0.05; if (s > bs) { bs = s; best = e; } }
    return best ? best.i : qb.team * 7 + 5;
  }
  function updAim(t, qb) {
    const inp = inputs[t]; if (!inp) return;
    if (G.aim[t] < 0) G.aim[t] = bestAim(qb);
    if (inp.m > 0.18 && !qb.aimLock) {
      let best = -1, bs = 0.35;
      for (const e of eligible(t)) { const dx = e.x - qb.x, dy = e.y - qb.y, n = hyp(dx, dy) || 1; const cs = (dx * inp.x + dy * inp.y) / (n * inp.m); if (cs > bs) { bs = cs; best = e.i; } }
      if (best >= 0) G.aim[t] = best;
    }
  }
  function cycleAim(t) { const el = eligible(t).map(e => e.i); const k = el.indexOf(G.aim[t]); G.aim[t] = el[(k + 1) % el.length]; }
  /* ---------------- defensive ACTION: grab the man closest to the ball, then time a play on the pass ---------------- */
  function closestDef(t, ref) {
    let best = null, bd = 1e9;
    for (const p of teamPl(t)) { if (p.st === 'down' || p.st === 'dive') continue; const dd = hyp(p.x - ref.x, p.y - ref.y) + (p.eng >= 0 ? 4 : 0); if (dd < bd) { bd = dd; best = p; } }
    return best;
  }
  /** switch to the defender closest to ref; true if control moved. A 0.6 yd hysteresis stops repeated presses thrashing between two men */
  function selectClosest(t, ref) {
    const me = P(G.ctl[t]), best = closestDef(t, ref); if (!best || best === me) return false;
    const dm = me.st === 'down' || me.st === 'dive' || me.eng >= 0 ? 1e9 : hyp(me.x - ref.x, me.y - ref.y);
    if (hyp(best.x - ref.x, best.y - ref.y) >= dm - 0.6) return false;
    G.ctl[t] = best.i; ev('switch', best.x, best.y, { t, i: best.i, sel: 1 }); return true;
  }
  function defPress(t, me, inp) {
    const b = G.ball, c = carrier();
    if (c) { // somebody has it: dive if close, otherwise take the defender nearest the carrier
      if (hyp(c.x - me.x, c.y - me.y) < 3.4 && me.st === 'ok' && me.eng < 0) return dive(me, c);
      return selectClosest(t, c);
    }
    if (b.st === 'air' && b.kind === 'pass') { // pass in the air: nearest man to where it comes down, then (already him) play the ball
      if (selectClosest(t, { x: b.tx, y: b.ty })) return;
      return tryLunge(t, P(G.ctl[t]), inp);
    }
    const tgt = b.st === 'air' && b.tgt >= 0 ? P(b.tgt) : b;
    selectClosest(t, tgt);
  }
  /** timing of a press relative to the ball's arrival (s, < 0 early). Online guests report the time-to-arrival they saw */
  function pressTiming(t, inp) {
    const b = G.ball, e = b.t - b.T, lag = G.lag[t] || 0;
    if (lag > 0 && inp && typeof inp.tta === 'number' && isFinite(inp.tta)) { const eg = -inp.tta; return eg >= e - lag - 0.1 && eg <= e + 0.05 ? eg : e - lag; }
    return e - lag;
  }
  function tryLunge(t, me, inp) {
    const b = G.ball;
    if ((b.lunge && b.lunge[t]) || me.st !== 'ok' || me.eng >= 0) return;
    const e = pressTiming(t, inp);
    if (-e > INT.minTTA) { ev('switch', me.x, me.y, { t, i: me.i, sel: 1 }); return; } // way early: just confirms your man, no lunge
    if (e > INT.late) return; // too late: the catch is already decided
    const held = !!b.hold, dx = b.tx - me.x, dy = b.ty - me.y, dist = hyp(dx, dy) || 1, v = Math.min(INT.lungeV, dist / INT.lungeT);
    b.lunge = b.lunge || {}; b.lunge[t] = { i: me.i, e, held };
    me.st = 'lunge'; me.stT = INT.lungeT; me.vx = dx / dist * v; me.vy = dy / dist * v; me.fa = Math.atan2(dy, dx);
    // early lunges cost a recovery: the longer the guess, the longer you stumble (so mashing doesn't work)
    me.recov = e < -INT.perfect ? 0.25 + 0.6 * Math.min(1, (-e - INT.perfect) / 0.4) : 0;
    ev('lunge', me.x, me.y, { t, i: me.i, g: intGrade(e) });
    if (held) resolvePass(b);
  }
  function switchTo(t) {
    const c = carrier(); const ref = c || (G.ball.st === 'air' ? { x: G.ball.tx, y: G.ball.ty } : G.ball);
    let best = null, bd = 1e9;
    for (const p of teamPl(t)) { if (p.i === G.ctl[t] || p.st === 'down') continue; const dd = hyp(p.x - ref.x, p.y - ref.y); if (dd < bd) { bd = dd; best = p; } }
    if (best) { G.ctl[t] = best.i; ev('switch', best.x, best.y, { t }); }
  }
  /** ball carrier's juke: a sharp plant-and-cut. Timed when a tackler is 0.9-2.7 yd away and coming, it can fake him
      out of his shoes (he stumbles and can't tackle for a moment). Too early or too late, it's just a cut; with nobody
      near it's a wasted plant that costs legs. */
  function juke(me) {
    const J = RUN.juke; me.jukeT = G.t; me.burst = J.burst; ev('juke', me.x, me.y);
    let q = null, qd = 1e9;
    for (const o of teamPl(1 - me.team)) { if (o.st !== 'ok' || o.eng >= 0) continue; const dd = hyp(o.x - me.x, o.y - me.y); if (dd < qd) { qd = dd; q = o; } }
    if (!q || qd > J.whiff) { me.carryT = (me.carryT || 0) + 0.7; return; }
    if (qd < J.near || qd > J.far) return;
    const s = sk(q.team), hq = G.human[q.team] && G.ctl[q.team] === q.i;
    // a defender coming at you bites; one trailing behind doesn't care. Sweet spot ~1.3-2.2 yd
    const closing = ((q.vx - me.vx) * (me.x - q.x) + (q.vy - me.vy) * (me.y - q.y)) / qd;
    const sweet = qd >= 1.3 && qd <= 2.2 ? 1 : 0.6;
    const pBite = (hq ? 0.35 : s.bite) * sweet * (closing > 1 ? 1 : 0.35) * (G.keyBite || 1);
    if (Math.random() < pBite) { q.st = 'stun'; q.stT = J.stun; q.tcd = J.stun + 0.15; ev('fake', q.x, q.y); if (!G.banner) banner('FAKED HIM OUT!', '', '#7cff7a', 0.8); }
  }
  function dive(p, tgt) {
    const dx = tgt.x + tgt.vx * 0.22 - p.x, dy = tgt.y + tgt.vy * 0.22 - p.y, n = hyp(dx, dy) || 1;
    p.st = 'dive'; p.stT = 0.34; p.vx = dx / n * 10.5; p.vy = dy / n * 10.5; p.fa = Math.atan2(dy, dx); p.eng = -1;
    ev('dive', p.x, p.y);
  }
  function updBlocks(dt, wants) {
    const off = G.off, c = carrier();
    // new engagements
    for (const o of G.pl) {
      if (o.team === (c ? c.team : off) ? false : true) continue;  // blockers are on the team with the ball
      if (o.eng >= 0 || o.st !== 'ok' || o === c || o.noEng > 0) continue;
      if (!(o.as === 'blk' || o.as === 'pull' || (G.run && o.as === 'route') || (c && c.team !== off))) continue;
      if (G.ball.st === 'held' && G.ball.holder === o.i) continue;
      for (const dfd of teamPl(1 - o.team)) {
        if (dfd.eng >= 0 || dfd.st !== 'ok' || dfd.i === o.lastShed || dfd.noEng > 0) continue;
        if (hyp(dfd.x - o.x, dfd.y - o.y) < 1.05) {
          o.eng = dfd.i; dfd.eng = o.i; dfd.engT = 0; dfd.shed = 0;
          const s = sk(dfd.team);
          dfd.shedNeed = (dfd.role === 'DT' || dfd.role === 'DE' ? 1 : 0.7) * s.shed * rand(0.65, 1.35) * (o.role === 'WR' || o.role === 'RB' ? 0.6 : 1);
          ev('pad', (o.x + dfd.x) / 2, (o.y + dfd.y) / 2);
          break;
        }
      }
    }
    // engaged pairs: they lock up and lean; the defender works free
    for (const dfd of G.pl) {
      if (dfd.eng < 0) continue;
      const o = P(dfd.eng); if (o.eng !== dfd.i) { dfd.eng = -1; continue; }
      if (dfd.team === (c ? c.team : off)) continue; // iterate from the defender side only
      const human = G.human[dfd.team] && G.ctl[dfd.team] === dfd.i && inputs[dfd.team];
      dfd.engT += dt;
      dfd.shed += dt * (human ? 0.25 + 2.6 * (inputs[dfd.team].m || 0) : 1);
      const w = wants[dfd.i], nx = dfd.x - o.x, ny = dfd.y - o.y, n = hyp(nx, ny) || 1;
      const push = o.role === 'WR' || o.role === 'RB' ? 0.5 : 1.0;
      const vx = w.x * 0.2 + nx / n * push * 0.9, vy = w.y * 0.2 + ny / n * push * 0.9;
      dfd.vx = vx; dfd.vy = vy; dfd.x += vx * dt; dfd.y += vy * dt;
      o.vx = vx; o.vy = vy; o.x = dfd.x - nx / n * 0.88; o.y = dfd.y - ny / n * 0.88;
      o.fa = Math.atan2(ny, nx); dfd.fa = Math.atan2(-ny, -nx);
      const far = c && hyp(c.x - dfd.x, c.y - dfd.y) > 8 && (c.role !== 'QB' || G.crossed);
      if (dfd.shed >= dfd.shedNeed || far || dfd.st !== 'ok' || o.st !== 'ok') {
        dfd.eng = -1; o.eng = -1; o.lastShed = dfd.i; dfd.noEng = 0.6;
        if (!far && dfd.shed >= dfd.shedNeed) { o.st = 'stun'; o.stT = 0.5; dfd.burst = 0.3; ev('shed', dfd.x, dfd.y); }
      }
    }
  }
  function separate() {
    const L = G.pl;
    for (let i = 0; i < 14; i++) for (let j = i + 1; j < 14; j++) {
      const a = L[i], b = L[j];
      if (a.st === 'down' || b.st === 'down' || a.eng === j) continue;
      if (G.wrap && (G.wrap.c === i || G.wrap.c === j)) continue;
      const c = carrier(); if (c && (c === a || c === b) && a.team !== b.team) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
      if (d < 0.7 && d > 1e-4) { const k = (0.7 - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
  }
  function checkTackles() {
    const c = carrier(); if (!c || c.imm > 0) return;
    for (const q of teamPl(1 - c.team)) {
      if (!(q.st === 'ok' || q.st === 'dive') || q.eng >= 0 || q.tcd > 0) continue;
      if (G.wrap && G.wrap.tk.includes(q.i)) continue;
      const dd = hyp(q.x - c.x, q.y - c.y), reach = q.st === 'dive' ? 1.5 : 1.0;
      if (dd > reach) continue;
      const s = sk(q.team);
      const rvx = q.vx - c.vx, rvy = q.vy - c.vy, closing = dd > 0 ? (rvx * (c.x - q.x) + rvy * (c.y - q.y)) / dd : 0;
      const humanC = G.human[c.team] && G.ctl[c.team] === c.i && inputs[c.team];
      const spin = humanC ? inputs[c.team].m || 0 : 0;
      const sack = c.role === 'QB' && !G.crossed && !G.thrown && c.team === G.off;
      if (G.wrap) { G.wrap.tk.push(q.i); G.wrap.m += 0.22; q.vx = q.vy = 0; continue; }
      let instant = false;
      if (q.st === 'dive') instant = Math.random() < 0.6 * s.tackle - spin * 0.12;
      else if (closing > 7.2) instant = Math.random() < 0.55 * s.tackle - spin * 0.15;
      if (sack) instant = instant || Math.random() < 0.45;
      if (instant) return tackle(c, q, closing > 7.2 || q.st === 'dive');
      G.wrap = { c: c.i, m: 0.42, tk: [q.i], t: 0, luck: 0.6 + 0.85 * Math.random() ** 2 }; // most wrap-ups are square; now and then it's only a shoestring grab
      ev('hit', c.x, c.y);
    }
  }
  function updWrap(dt, wants) {
    const W = G.wrap; if (!W) return;
    const c = P(W.c); if (G.ball.holder !== c.i || G.ball.st !== 'held') { for (const i of W.tk) { const q = P(i); if (q.st === 'dive') q.st = 'ok'; } G.wrap = null; return; }
    W.t += dt;
    let T = 0;
    for (const i of W.tk) {
      const q = P(i), hq = G.human[q.team] && G.ctl[q.team] === q.i && inputs[q.team];
      T += hq ? 0.55 + (inputs[q.team].m || 0) * 1.3 : 0.5 + 0.5 * sk(q.team).tackle;
    }
    const hc = G.human[c.team] && G.ctl[c.team] === c.i && inputs[c.team];
    const E = (hc ? (0.1 + Math.min(1, inputs[c.team].m || 0) * RUN.spin) * W.luck : sk(c.team).esc * (c.role === 'QB' ? 0.8 : 1.15) * rand(0.6, 1.4)) * (0.6 + 0.4 * tire(c));
    W.m += (T - E) * dt * 1.3;
    W.T = T; W.E = E;
    // the pile drags along the carrier's intended direction
    const w = wants[c.i], k = 0.3 / Math.max(1, W.tk.length * 0.8);
    c.vx = w.x * k; c.vy = w.y * k; c.x += c.vx * dt; c.y += c.vy * dt;
    for (let n = 0; n < W.tk.length; n++) {
      const q = P(W.tk[n]), a = Math.atan2(q.y - c.y, q.x - c.x);
      q.x = c.x + Math.cos(a) * 0.62; q.y = c.y + Math.sin(a) * 0.62; q.vx = c.vx; q.vy = c.vy; q.fa = a + Math.PI;
      if (q.st === 'dive') q.st = 'ok';
    }
    if (W.m >= 1 || W.t > 1.8) return tackle(c, P(W.tk[0]), false);
    if (W.m <= 0) { // broke the tackle!
      for (const i of W.tk) { const q = P(i); q.st = 'down'; q.stT = 0.9; q.tcd = 1.2; }
      c.imm = 0.45; c.burst = 0.5; G.wrap = null; G.excite = Math.min(1, G.excite + 0.45);
      ev('break', c.x, c.y); banner('BROKE THE TACKLE!', '', '#ffd23c', 1.0);
    }
  }
  function tackle(c, q, big) {
    const b = G.ball;
    // fumble?
    const fum = Math.random() < (big ? 0.055 : 0.012) && !(c.role === 'QB' && !G.crossed);
    c.st = 'down'; c.stT = 99; q.st = 'down'; q.stT = 99;
    if (G.wrap) for (const i of G.wrap.tk) { P(i).st = 'down'; P(i).stT = 99; }
    G.wrap = null;
    ev(big ? 'bighit' : 'tackle', c.x, c.y);
    if (fum) {
      const a = rand(0, Math.PI * 2), s = rand(3, 5.5);
      Object.assign(b, { st: 'loose', holder: -1, x: c.x, y: c.y, z: 1.0, vx: Math.cos(a) * s + c.vx * 0.3, vy: Math.sin(a) * s + c.vy * 0.3, vz: 3.5, t: 0, kind: 'fumble' });
      ev('fumble', c.x, c.y); banner('FUMBLE!', '', '#ff5a4a', 1.4); G.excite = 1;
      return;
    }
    endPlay({ type: 'tackle', team: c.team, x: c.x, y: c.y, sack: c.role === 'QB' && !G.crossed && !G.thrown && c.team === G.off, big });
  }
  function updBall(dt) {
    const b = G.ball;
    if (b.st === 'held') { const h = P(b.holder); b.x = h.x; b.y = h.y; b.z = 1.15; return; }
    if (b.st === 'air' && b.hold) { // a contested catch: the ball is at the catch point while a human defender may still play it
      b.t += dt; const r = b.arr && b.arr.r >= 0 ? P(b.arr.r) : null;
      if (r && r.st !== 'down') { b.x += (r.x - b.x) * Math.min(1, dt * 10); b.y += (r.y - b.y) * Math.min(1, dt * 10); }
      if (G.t >= b.hold) resolvePass(b);
      return;
    }
    if (b.st === 'air') {
      b.t += dt; const u = Math.min(1, b.t / b.T);
      const g = b.kind === 'pass' ? 11 : 0, T = b.T;
      b.x = b.sx + (b.tx - b.sx) * u; b.y = b.sy + (b.ty - b.sy) * u;
      const vz0 = (b.tz - b.sz + 0.5 * g * T * T) / T; b.z = b.sz + vz0 * b.t - 0.5 * g * b.t * b.t;
      if (b.kind !== 'pass') b.z = b.sz + (b.tz - b.sz) * u + Math.sin(u * Math.PI) * 0.3;
      if (b.t >= T) arrive(b, vz0 - g * T);
      return;
    }
    if (b.st === 'loose' || b.st === 'fall') {
      b.t += dt; b.vz -= 11 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.z <= 0.12) { b.z = 0.12; if (Math.abs(b.vz) > 1.5) { b.vz = -b.vz * 0.45; b.vx *= 0.7; b.vy *= 0.7; if (b.st === 'loose') ev('bounce', b.x, b.y); } else { b.vz = 0; b.vx *= 0.92; b.vy *= 0.92; } }
      if (b.st === 'fall') { if (b.z <= 0.13 && Math.abs(b.vz) < 0.5 || b.t > 1.5) return endPlay({ type: 'incomplete' }); return; }
      // recover
      if (b.z < 0.9) {
        let best = null, bd = 0.95;
        for (const p of G.pl) { if (p.st === 'down') continue; const dd = hyp(p.x - b.x, p.y - b.y); if (dd < bd) { bd = dd; best = p; } }
        if (best) { b.st = 'held'; b.holder = best.i; ev('recover', best.x, best.y); return endPlay({ type: 'recover', team: best.team, x: best.x, y: best.y }); }
      }
      if (b.y < 0 || b.y > FIELD_W || b.x < 0 || b.x > 120 || b.t > 5) return endPlay({ type: 'fumbleout', x: b.x });
    }
  }
  function arrive(b, vzEnd) {
    const tgt = b.tgt >= 0 ? P(b.tgt) : null;
    if (b.kind === 'snap') { const qb = P(b.tgt); giveBall(qb); return; }
    if (b.kind === 'pitch') { const rb = P(b.tgt); if (hyp(rb.x - b.x, rb.y - b.y) < 3 && rb.st === 'ok') { giveBall(rb, 'catch'); return; } b.st = 'loose'; b.vx = (b.tx - b.sx) * 0.5; b.vy = (b.ty - b.sy) * 0.5; b.vz = 1; ev('fumble', b.x, b.y); return; }
    // forward pass: who is there when it arrives
    const off = G.off, def = 1 - off; let r = null, rd = 1.75, dq = null, dd = 1.45;
    for (const p of G.pl) {
      if (p.st === 'down' || p.eng >= 0) continue;
      const di = hyp(p.x - b.x, p.y - b.y);
      if (p.team === off && (p.role === 'WR' || p.role === 'RB') && di < rd) { rd = di; r = p; }
      if (p.team !== off && di < dd) { dd = di; dq = p; }
    }
    b.arr = { r: r ? r.i : -1, rd, dq: dq ? dq.i : -1, dd, vz: vzEnd, d: G.pl.map(p => hyp(p.x - b.tx, p.y - b.ty)) };
    // a human defender near the catch who hasn't pressed yet gets the LATE window (plus link lag online) before it is decided
    const me = G.human[def] ? P(G.ctl[def]) : null;
    if (me && !(b.lunge && b.lunge[def]) && me.st === 'ok' && me.eng < 0 && b.arr.d[me.i] <= INT.reach) { b.hold = G.t + INT.late + (G.lag[def] || 0); return; }
    resolvePass(b);
  }
  function intercept(p) {
    if (p.st === 'lunge' || p.st === 'stun') { p.st = 'ok'; p.recov = 0; }
    p.imm = Math.max(p.imm, 0.3);
    giveBall(p, 'int'); G.run = true; G.runT = G.t; G.ctl[p.team] = p.i; banner('INTERCEPTED!', '', '#ff5a4a', 1.3); G.excite = 1; G.intercepted = true;
  }
  /** decide a forward pass: a timed lunge first, then the ordinary contest */
  function resolvePass(b) {
    const A = b.arr, off = G.off, def = 1 - off, vzEnd = A.vz; b.hold = 0;
    const r = A.r >= 0 ? P(A.r) : null, rd = A.rd; let dq = A.dq >= 0 ? P(A.dq) : null, dd = A.dd;
    const L = b.lunge && b.lunge[def];
    if (L) {
      const p = P(L.i), d = L.held ? Math.max(0, A.d[p.i] - INT.lateReach) : hyp(p.x - b.tx, p.y - b.ty);
      const base = G.human[off] ? INT.pvp : INT.human[G.opts.diff], ft = intTiming(L.e), fd = intDist(d);
      const pI = intOdds(L.e, d, base, r && rd < d - 0.25);
      G.lastPick = { e: +L.e.toFixed(3), d: +d.toFixed(2), ft: +ft.toFixed(2), fd: +fd.toFixed(2), p: +pI.toFixed(3), g: intGrade(L.e) };
      if (Math.random() < pI) { G.lastPick.int = true; return intercept(p); }
      const q = ft * fd;
      if (q >= 0.12 && Math.random() < 0.45 + 0.45 * q) { ev('deflect', b.x, b.y); G.lastPick.brk = true; return fall(b, vzEnd, true); }
      if (dq === p) dq = null; // he missed it; the receiver can still make the catch
    }
    const s = sk(def);
    if (dq && (!r || dd < rd - 0.25) && dq.st !== 'down') {
      const hd = G.human[dq.team] && G.ctl[dq.team] === dq.i;
      let pInt;
      if (hd) pInt = INT.passive * (dd < 0.8 ? 1.3 : 1);
      else { // CPU defender: a timing-based play on the ball, sharper on higher levels
        const e = gauss() * INT.cpuSig[G.human[off] ? G.opts.diff : 1];
        pInt = intOdds(e, dd, INT.cpu[G.human[off] ? G.opts.diff : 1], false);
        dq.st = 'lunge'; dq.stT = 0.2; dq.recov = 0; dq.vx *= 0.5; dq.vy *= 0.5; ev('lunge', dq.x, dq.y, { t: dq.team, i: dq.i, g: intGrade(e), cpu: 1 });
      }
      if (Math.random() < pInt) return intercept(dq);
      ev('deflect', b.x, b.y); return fall(b, vzEnd, true);
    }
    if (r && r.st !== 'down') {
      const pc = 0.94 - (dq ? (1.45 - dd) * 0.38 : 0) - (rd / 1.75) * 0.16;
      if (Math.random() < pc) { giveBall(r, 'catch'); G.run = true; G.runT = G.t; G.caught = true; if (Math.abs(r.x - G.los) > 15) G.excite = Math.min(1, G.excite + 0.4); return; }
      ev('drop', b.x, b.y);
    }
    fall(b, vzEnd, false);
  }
  function fall(b, vz, deflect) {
    b.st = 'fall'; b.t = 0; const T = Math.max(0.2, b.T);
    b.vx = (b.tx - b.sx) / T * (deflect ? -0.15 : 0.45); b.vy = (b.ty - b.sy) / T * (deflect ? 0.3 : 0.45); b.vz = deflect ? 3 : Math.min(vz, -1);
  }
  function checkDead() {
    const c = carrier(); if (!c) return;
    const d = dirOf(c.team);
    if ((c.x - goalX(c.team)) * d > 0) return endPlay({ type: 'td', team: c.team, x: c.x, y: c.y });
    if (c.y < 0 || c.y > FIELD_W) return endPlay({ type: 'oob', team: c.team, x: c.x, y: c.y });
    if (c.x < 0 || c.x > 120) return endPlay({ type: 'oob', team: c.team, x: clamp(c.x, 0, 120), y: c.y });
  }

  /* ---------------- special teams ---------------- */
  function updSpecial(dt) {
    const S = G.special, b = G.ball, off = G.off, d = dirOf(off), qb = P(off * 7 + 3);
    // everybody: kicking team covers, receiving team waits
    for (const p of G.pl) {
      let w = { x: 0, y: 0 };
      if (p !== qb && p.team === off && S.k === 'punt' && G.t > 0.9) w = { x: d * p.maxv * 0.8, y: (MID_Y - p.y) * 0.05 };
      if (p.team !== off && S.k === 'punt' && G.t > 0.9 && b.st === 'air') w = moveTo(p, b.tx + d * 4 * (p.slot === 6 ? 0 : 1), b.ty + (p.slot - 3) * 3, p.maxv * 0.7, 1);
      if (p.team !== off && S.k === 'fg' && p.slot <= 2 && G.t < 1.2) w = { x: -d * 3, y: 0 };
      integrate(p, w, dt, 12);
    }
    if (b.st === 'held' && G.t > S.at) {
      if (S.k === 'punt') {
        const dist = rand(36, 49), L = { x: clamp(qb.x + d * dist, -2, 122), y: clamp(qb.y + rand(-9, 9), 3, FIELD_W - 3) };
        Object.assign(b, { st: 'air', kind: 'punt', holder: -1, t: 0, T: rand(3.6, 4.4), sx: qb.x, sy: qb.y, sz: 1.0, tx: L.x, ty: L.y, tz: 0.2, tgt: -1, launch: G.t });
      } else {
        const gx = off === 0 ? 120 : 0, dist = Math.abs(gx - qb.x), pk = clamp(1.04 - Math.max(0, dist - 22) * 0.019, 0.08, 0.97);
        S.good = Math.random() < pk; S.dist = Math.round(dist);
        const miss = S.good ? rand(-1.6, 1.6) : (Math.random() < 0.5 ? -1 : 1) * rand(3.4, 6);
        Object.assign(b, { st: 'air', kind: 'fg', holder: -1, t: 0, T: 1.2 + dist * 0.017, sx: qb.x, sy: qb.y, sz: 0.3, tx: gx + d * 2, ty: MID_Y + miss, tz: S.good ? 6.5 : rand(3, 6), tgt: -1, launch: G.t });
      }
      qb.kickT = 0.5; ev('kick', qb.x, qb.y);
    }
    if (b.st === 'air' && b.kind === 'snap') { updBall(dt); }
    else if (b.st === 'air') {
      b.t += dt; const u = Math.min(1, b.t / b.T);
      b.x = b.sx + (b.tx - b.sx) * u; b.y = b.sy + (b.ty - b.sy) * u;
      const H = b.kind === 'punt' ? 16 : 7; b.z = b.sz + (b.tz - b.sz) * u + Math.sin(u * Math.PI) * H;
      if (u >= 1) {
        if (b.kind === 'punt') {
          const recv = 1 - off; let x = b.x, tb = false;
          if ((x - goalX(off)) * d > 0) { x = off === 0 ? 90 : 30; tb = true; }  // touchback at receiving team's 20
          return endPlay({ type: 'punt', x, tb, dist: Math.round(Math.abs(b.x - G.los)) });
        }
        return endPlay({ type: 'fg', good: S.good, dist: S.dist + 0 });
      }
    }
    if (b.st === 'held') { b.x = qb.x; b.y = qb.y; b.z = 0.9; }
  }

  /* ---------------- end of a play: the rules ---------------- */
  /** the defense remembers how this offense moved the ball: runs vs passes, outside vs inside, QB scrambles */
  function learn(r) {
    const k = G.key[G.off], a = 0.34, mix = (f, v) => { k[f] += (v - k[f]) * a; };
    if (G.kind !== 'run' && G.kind !== 'pass') return;
    const c = carrier(), ran = G.run && !G.thrown && !G.caught && !G.intercepted && c && c.team === G.off && r.y != null;
    k.n++;
    if (!ran) { mix('run', 0); mix('scr', 0); k.out *= 0.8; return; } // throwing it keeps them honest
    const lat = r.y - G.ballY, out = Math.abs(lat) > 8 || r.y < 6 || r.y > FIELD_W - 6;
    mix('run', 1); mix('out', out ? 1 : 0); mix('scr', c.role === 'QB' && G.kind === 'pass' ? 1 : 0); mix('side', Math.abs(lat) > 4 ? Math.sign(lat) : 0);
  }
  function endPlay(r) {
    if (G.phase !== 'live') return;
    if (r.type === 'td' || r.type === 'tackle' || r.type === 'oob' || r.type === 'incomplete') learn(r);
    G.phase = 'result'; G.t = 0; G.result = r; G.wrap = null;
    const b = G.ball, off = G.off, d = dirOf(off), def = 1 - off;
    ev('whistle');
    b.vx = b.vy = 0;
    if (b.st !== 'held') b.st = 'dead';
    let next = null; // { team, x, y, first }
    const spotY = y => clamp(y, HASH[0], HASH[1]);
    const gainOf = x => (x - G.los) * d;
    G.lastGain = 0;
    switch (r.type) {
      case 'td': {
        G.score[r.team] += 6; G.stats.tds[r.team]++; G.excite = 1;
        const pat = Math.random() < 0.96; if (pat) G.score[r.team] += 1;
        banner('TOUCHDOWN!', (r.team === 0 ? 'XPRESS' : 'OUTLAWS') + (pat ? ' · EXTRA POINT IS GOOD' : ' · EXTRA POINT NO GOOD'), '#ffd23c', 3.2);
        ev('td', r.x, r.y, { t: r.team });
        next = { team: 1 - r.team, x: (1 - r.team) === 0 ? 35 : 85, y: MID_Y, first: true, kick: true };
        break;
      }
      case 'tackle': case 'oob': case 'recover': {
        const team = r.team, x = r.x;
        // safety: down in your own end zone
        const ownEZ = team === 0 ? x < 10 : x > 110;
        if (ownEZ && !(r.type === 'recover' && team !== off && false)) {
          if (G.intercepted && team !== off) { next = { team, x: team === 0 ? 30 : 90, y: MID_Y, first: true }; banner('TOUCHBACK', '', '#fff'); break; }
          G.score[1 - team] += 2; banner('SAFETY!', '+2 ' + (1 - team === 0 ? 'XPRESS' : 'OUTLAWS'), '#ff5a4a', 2.6); ev('crowd');
          next = { team: 1 - team, x: (1 - team) === 0 ? 40 : 80, y: MID_Y, first: true, kick: true };
          break;
        }
        if (team !== off) {
          banner(r.type === 'recover' ? 'FUMBLE RECOVERED!' : G.intercepted ? 'TURNOVER' : 'TURNOVER', (team === 0 ? 'XPRESS' : 'OUTLAWS') + ' BALL', '#ff5a4a');
          next = { team, x, y: spotY(r.y), first: true }; G.excite = Math.max(G.excite, 0.7); break;
        }
        const g = gainOf(x); G.lastGain = g;
        if (g >= G.togo - 0.01) {
          next = { team: off, x, y: spotY(r.y), first: true };
          banner(g >= 20 ? 'BIG GAIN! FIRST DOWN' : 'FIRST DOWN', fmtGain(g), '#7cff7a'); ev('firstdown');
          if (g >= 20) G.excite = Math.max(G.excite, 0.8);
        } else {
          next = downNext(x, spotY(r.y));
          if (!next.turn) banner(r.sack ? 'SACKED!' : r.type === 'oob' ? 'OUT OF BOUNDS' : 'TACKLED', fmtGain(g), r.sack ? '#ff8a4a' : '#fff');
        }
        if (r.big && !next.turn) { G.banner.t = 'BIG HIT!'; }
        break;
      }
      case 'incomplete': case 'fumbleout': {
        const x = r.type === 'fumbleout' ? clamp(r.x, 11, 109) : G.los;
        next = downNext(r.type === 'fumbleout' && (r.x - G.los) * d < 0 ? x : G.los, G.ballY);
        if (!next.turn) banner(r.type === 'incomplete' ? 'INCOMPLETE' : 'OUT OF BOUNDS', '', '#ddd');
        ev('aww');
        break;
      }
      case 'punt': {
        banner(r.tb ? 'PUNT · TOUCHBACK' : 'PUNT ' + r.dist + ' YARDS', (def === 0 ? 'XPRESS' : 'OUTLAWS') + ' BALL', '#fff');
        next = { team: def, x: r.x, y: MID_Y, first: true }; break;
      }
      case 'fg': {
        if (r.good) { G.score[off] += 3; banner('FIELD GOAL IS GOOD!', r.dist + ' YARDS', '#ffd23c', 2.8); ev('fg'); G.excite = 0.9; next = { team: def, x: def === 0 ? 35 : 85, y: MID_Y, first: true, kick: true }; }
        else { banner('NO GOOD!', 'WIDE ' + (G.ball.ty < MID_Y ? 'LEFT' : 'RIGHT'), '#ff5a4a', 2.4); ev('aww'); const x = (G.los - d * 7); next = { team: def, x: def === 0 ? Math.max(x, 30) : Math.min(x, 90), y: MID_Y, first: true }; }
        break;
      }
    }
    G.next = next; G.intercepted = false;
  }
  function fmtGain(g) { const n = Math.round(g); return n === 0 ? 'NO GAIN' : n > 0 ? 'GAIN OF ' + n : 'LOSS OF ' + (-n); }
  function downNext(x, y) {
    const off = G.off, g = (x - G.los) * dirOf(off);
    if (G.down >= 4) { banner('TURNOVER ON DOWNS', ((1 - off) === 0 ? 'XPRESS' : 'OUTLAWS') + ' BALL', '#ff5a4a'); return { team: 1 - off, x, y, first: true, turn: true }; }
    return { team: off, x, y, first: false, gain: g };
  }
  function updResult(dt) {
    // tackled players get up after a moment; everybody slows down
    for (const p of G.pl) {
      if (p.st === 'down' && p.stT > 50) p.stT = rand(0.9, 1.6);
      if (p.st === 'down') { p.stT -= dt; if (p.stT <= 0) p.st = 'ok'; }
      if (p.eng >= 0) p.eng = -1;
      integrate(p, { x: 0, y: 0 }, dt, 9);
    }
    const b = G.ball; if (b.st === 'held') { const h = P(b.holder); b.x = h.x; b.y = h.y; b.z = h.st === 'down' ? 0.3 : 1.15; }
    else if (b.st === 'loose' || b.st === 'fall') { b.st = 'dead'; }
    const hold = G.result && (G.result.type === 'td' || G.result.type === 'fg') ? 3.0 : 2.1;
    if (G.t < hold) return;
    // apply the result
    const n = G.next;
    if (G.clock <= 0) {
      if (G.half === 1) { G.phase = 'half'; G.t = 0; banner('HALFTIME', G.score[0] + ' - ' + G.score[1], '#fff', 3.4); ev('horn'); return; }
      G.phase = 'over'; G.over = true; G.t = 0; ev('horn');
      const w = G.score[0] === G.score[1] ? 'TIE GAME' : (G.score[0] > G.score[1] ? 'XPRESS WIN!' : 'OUTLAWS WIN!');
      banner('FINAL', w, '#ffd23c', 999); return;
    }
    if (n) {
      if (n.first) { setPossession(n.team, n.x, true); }
      else { G.down++; G.togo = Math.max(0.5, G.togo - n.gain); G.los = clamp(n.x, 11, 109); setFd(); }
      G.ballY = n.y;
      if (n.kick) { G.ballY = MID_Y; placeFormation(true); }
    }
    beginSelect();
  }

  /* ---------------- snapshot (what screens draw; what the guest receives) ---------------- */
  const r2 = v => Math.round(v * 100) / 100;
  function snapshot() {
    const b = G.ball, revealed = G.phase === 'live' || G.phase === 'result';
    return {
      ph: G.phase, clk: Math.ceil(G.clock * 10) / 10, half: G.half, sc: G.score.slice(), dn: G.down, tg: r2(G.togo), los: r2(G.los), fd: r2(G.fd), gtg: G.goalToGo ? 1 : 0, off: G.off, by: r2(G.ballY),
      pl: G.pl.map(p => [r2(p.x), r2(p.y), r2(p.fa), r2(hyp(p.vx, p.vy)), p.st === 'down' ? 1 : p.st === 'dive' ? 2 : p.eng >= 0 ? 3 : p.st === 'stun' ? 4 : p.st === 'lunge' ? 5 : 0, p.num, p.throwT > 0 || p.kickT > 0 ? 1 : 0]),
      b: [r2(b.x), r2(b.y), r2(b.z), b.st === 'held' ? 0 : b.st === 'air' ? 1 : b.st === 'dead' ? 3 : 2, b.holder, b.kind === 'pass' || b.kind === 'punt' || b.kind === 'fg' ? 1 : 0],
      bt: b.st === 'air' ? [r2(b.tx), r2(b.ty), b.tgt] : null, ba: b.st === 'air' && b.kind === 'pass' ? r2(b.T - b.t) : null,
      fl: revealed ? G.pflip.map(f => f ? 1 : 0) : null, // FLIP calls: like the calls themselves, only after the snap
      ctl: G.ctl.slice(), aim: G.aim.slice(), lk: G.pend.slice(), selT: Math.ceil(G.selT), hum: G.human.slice(),
      w: G.wrap ? [G.wrap.c, r2(G.wrap.m)] : null,
      bn: G.banner ? [G.banner.t, G.banner.sub, G.banner.c, G.banner.id] : null,
      ev: G.ev.slice(), calls: revealed ? G.calls : null, kind: revealed ? G.kind : '', thrown: G.thrown ? 1 : 0, crossed: G.crossed ? 1 : 0,
      over: G.over ? 1 : 0, ex: r2(G.excite), t: r2(G.t), fgok: offenseChoices().some(p => p.id === 'fg') ? 1 : 0, gid: G.gid,
      // HELMET CAM: what each AI player is doing this step [kind, target x, target y, target player], the routes still to run, and the defense's read
      it: G.phase === 'live' ? G.pl.map(p => p.itK ? [p.itK, r1(p.itX), r1(p.itY), p.itO == null ? -1 : p.itO] : 0) : null,
      rt: G.phase === 'live' && !G.thrown && G.kind === 'pass' ? G.pl.map(p => p.as === 'route' && p.route && p.wp < p.route.length && p.itK === 'route' ? p.route.slice(p.wp).map(q => [r1(q.x), r1(q.y)]) : 0) : null,
      ky: keyTag(G.off) || null,
    };
  }
  const r1 = v => Math.round(v * 10) / 10;
  /** what the defense has keyed on from this offense's habits ('' until it has seen enough) */
  function keyTag(off) { const k = G.key[off]; if (!k || k.n < 3) return ''; return k.scr > 0.55 ? 'THE QB SCRAMBLE' : k.out > 0.6 ? 'THE OUTSIDE RUN' : k.run > 0.7 ? 'THE RUN' : ''; }
  /** tests: put the ball on a spot for `team` and start the play-call screen */
  function testSpot(team, x, y) { setPossession(team, x, true); G.ballY = y; placeFormation(true); beginSelect(); }
  return { get G() { return G; }, testSpot, RUN, newGame, update, pick, lock, snapshot, offenseChoices, cpuPick, dirOf, endPlay, carrier: () => carrier(), formPos: p => formPos(p), closestDef, INT, intOdds, intTiming, intDist };
})();
