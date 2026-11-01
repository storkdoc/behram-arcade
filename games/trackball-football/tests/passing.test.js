/* Trackball Football: "passing is fair and forgiving" (pure Node, no browser).
   Loads plays.js + sim.js headlessly and has scripted human QBs throw against the normal CPU defense, with the
   human's controls modelled the way they reach the sim in the real game: a heavy trackball (same spin-up, slip and
   friction constants as js/trackball.js) that keeps rolling after the hand stops, reaction delays, and the target
   picked from the on-screen ring (auto-aim + NEXT), not set directly. Player models:
     casual     - drops back, throws whoever the ring is on after ~1-2 s, steers the receiver late and loosely
     reasonable - looks for the open man (gets it right most of the time), taps NEXT to put the ring on him,
                  throws on time or early under pressure, steers the receiver to the ball after ~0.3 s
     expert     - instant read of the most open man, perfect receiver steering
   Reports completion %, interception %, sack % and yards per dropback per level, plus the same throws into a
   defense that correctly sold out for the call (should stay risky). Asserts the passing targets.
   Run from the repo root:  node games/trackball-football/tests/passing.test.js   (env: N = dropbacks per case, NOCHECK=1) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.join(__dirname, '..', 'js');
const ctx = { console, Math, performance: { now: () => 0 } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(DIR, 'plays.js'), 'utf8') + '\n' + fs.readFileSync(path.join(DIR, 'sim.js'), 'utf8') + '\nthis.Sim = Sim; this.STEP = STEP;', ctx);
const Sim = ctx.Sim, STEP = ctx.STEP, W = 53.333;
const N = +process.env.N || 400;
const say = (...a) => console.log(a.join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
const PASSES = ['slants', 'post', 'bomb', 'screen'];
const hyp = Math.hypot, rnd = (a, b) => a + Math.random() * (b - a);

/** the trackball as in js/trackball.js: the hand drags the ball's surface speed, then it coasts on friction */
function Ball() {
  const w = { x: 0, y: 0 };
  return {
    w,
    step(hand, dt) { // hand = null (hands off) or {x, y} hand speed (1 = full)
      if (hand) {
        const hm = hyp(hand.x, hand.y), wm = hyp(w.x, w.y), dot = hand.x * w.x + hand.y * w.y;
        const k = wm > 0.02 && dot < -0.05 * hm * wm ? 22 : hm > wm ? 9 : hm < 0.08 ? 7 : 2.2, a = 1 - Math.exp(-k * dt);
        w.x += (hand.x - w.x) * a; w.y += (hand.y - w.y) * a;
      }
      const f = Math.exp(-0.85 * dt); w.x *= f; w.y *= f;
      let wm = hyp(w.x, w.y); if (wm > 0) { const n = Math.max(0, wm - 0.05 * dt); w.x *= n / wm; w.y *= n / wm; wm = n; }
      if (wm > 1.35) { w.x *= 1.35 / wm; w.y *= 1.35 / wm; wm = 1.35; } if (wm < 0.004) w.x = w.y = 0;
    },
    cmd() { const m = hyp(w.x, w.y); if (m < 0.03) return { x: 0, y: 0, m: 0 }; const s = Math.min(1.15, Math.pow(m, 0.9)); return { x: w.x / m * s, y: w.y / m * s, m: s }; },
  };
}
const PROFILES = {
  //        read: chance he spots the most open man · noise: yd of misjudged space · tThrow: hold time range (s)
  //        rx: receiver reaction after the throw (s) · steer: how well he leads his man to the ball (0..1) · next: s per NEXT tap
  casual: { read: 0.35, noise: 2.5, tThrow: [1.0, 2.1], rx: 0.45, steer: 0.7, next: 0, panic: 1.6 },
  reasonable: { read: 0.75, noise: 1.2, tThrow: [0.9, 1.8], rx: 0.3, steer: 0.88, next: 0.18, panic: 2.2 },
  expert: { read: 1, noise: 0, tThrow: [0.8, 1.5], rx: 0.15, steer: 1, next: 0.12, panic: 2.2 },
};
const READS = { slants: [5, 6, 4], post: [5, 6, 4], bomb: [5, 6], screen: [4] };
function steer(G, me, d) { // a decent runner: daylight, away from the closest threats
  let vx = d, vy = 0;
  for (const q of G.pl) { if (q.team === me.team || q.st === 'down' || q.eng >= 0) continue;
    const dx = me.x - q.x, dy = me.y - q.y, dist = hyp(dx, dy); if (dist > 10) continue;
    const ahead = (q.x - me.x) * d > -1 ? 1 : 0.3, w = ahead * 4 / Math.max(0.5, dist * dist);
    vy += dy / dist * w * 1.3; vx += dx / dist * w * 0.25; }
  if (me.y < 3) vy += 0.6; if (me.y > W - 3) vy -= 0.6; if (vx * d < 0.2) vx = d * 0.2; const n = hyp(vx, vy) || 1; return { x: vx / n, y: vy / n };
}
function space(G, r) { let s = 99; for (const q of G.pl) if (q.team !== r.team && q.st === 'ok') s = Math.min(s, hyp(q.x - r.x, q.y - r.y)); return s; }
/** one dropback: the human (team 0) calls a pass; force = { pick, k, flip } to make the CPU defense sell out */
function dropback(id, flip, diff, prof, force) {
  const G = Sim.G, d = 1, P = PROFILES[prof];
  G.clock = 900; G.half = 1; G.score = [0, 0];
  Sim.testSpot(0, 45, W / 2 + (Math.random() - 0.5) * 6);
  if (force) { G.picks[1] = force.pick; G.readK[1] = force.k || null; G.pflip[1] = !!force.flip; }
  Sim.pick(0, id, flip);
  const tb = Ball(), blank = () => ({ x: 0, y: 0, m: 0, aP: false, bP: false });
  const throwAt = rnd(P.tThrow[0], P.tThrow[1]) + (id === 'bomb' ? 0.5 : id === 'screen' ? 0.35 : 0);
  const dropT = id === 'bomb' || id === 'screen' ? 0.6 : 0.4;
  let want = -1, nextT = 0, thrownAt = -1, out = { att: false };
  for (let k = 0; k < 60 * 30; k++) {
    const inp = blank(); let hand = null;
    if (G.phase === 'presnap') { if (G.t > 0.8) inp.aP = true; }
    else if (G.phase === 'live') {
      const me = G.pl[G.ctl[0]], qbPass = me.role === 'QB' && G.kind === 'pass' && !G.thrown && !G.crossed;
      if (qbPass) {
        if (G.t < dropT) hand = { x: -d * 0.9, y: 0 }; // stroke the ball back to take the drop, then let go (it coasts)
        let near = 99; for (const q of G.pl) if (q.team === 1 && q.st === 'ok' && q.eng < 0) near = Math.min(near, hyp(q.x - me.x, q.y - me.y));
        const go = G.t > throwAt || (near < P.panic && G.t > 0.6);
        if (G.t > throwAt - 0.45 && want < 0) { // decide who to throw to
          const list = READS[id]; let best = list[0], bs = -1e9;
          for (const i of list) { const r = G.pl[i]; if (r.st !== 'ok') continue; const sc = Math.min(space(G, r) + (Math.random() - 0.5) * 2 * P.noise, 6) + (r.x - G.los) * 0.04; if (sc > bs) { bs = sc; best = i; } }
          want = Math.random() < P.read ? best : (P.next ? list[Math.floor(Math.random() * list.length)] : G.aim[0]);
        }
        if (want >= 0 && P.next && G.aim[0] !== want && G.t - nextT > P.next && !go) { inp.bP = true; nextT = G.t; }
        if (go) { inp.aP = true; thrownAt = G.t; out.att = true; }
      } else if (G.thrown && G.ball.st === 'air' && G.ball.tgt === me.i) {
        if (G.t - thrownAt > P.rx) { // steer him to where it's coming down, arriving on time
          const b = G.ball, ex = (1 - P.steer) * (Math.random() - 0.5) * 6;
          const v = { x: b.tx - me.x, y: b.ty + ex - me.y }, dist = hyp(v.x, v.y), left = Math.max(0.05, b.T - b.t);
          const s = dist < 0.3 ? 0 : Math.min(1.15, (dist / left) / 8.5 + 0.15) * P.steer + (1 - P.steer) * 0.6;
          hand = { x: v.x / (dist || 1) * s, y: v.y / (dist || 1) * s };
        }
      } else if (Sim.carrier() === me) hand = steer(G, me, d); // after the catch (or a scramble): run for daylight
      tb.step(hand, STEP); Object.assign(inp, tb.cmd());
    } else if (G.phase === 'result') {
      const r = G.result || {};
      const gain = r.type === 'td' && r.team === 0 ? 110 - G.los : r.x != null && (r.type === 'tackle' || r.type === 'oob') && r.team === 0 ? r.x - G.los : 0;
      return { att: out.att && !r.sack, comp: !!G.caught && !(r.team === 1), int: (r.team === 1 && (r.type === 'tackle' || r.type === 'td' || r.type === 'oob')), sack: !!r.sack, gain, td: r.type === 'td' && r.team === 0, ctr: !!G.ctr, hit: !!(G.ctr && G.ctr.hit) };
    }
    Sim.update(STEP, [inp, null]);
  }
  return { att: false, comp: false, int: false, sack: false, gain: 0 };
}
function run(diff, prof, n, forced) {
  Sim.newGame({ human: [true, false], diff, half: 900 });
  const R = [];
  for (let i = 0; i < n; i++) {
    const id = PASSES[i % 4], flip = Math.random() < 0.5;
    Sim.G.sc[0].h.length = 0; // a fresh scouting history: only `forced` sells out
    R.push(dropback(id, flip, diff, prof, forced ? { pick: 'read', k: Sim.callKey(id, flip) } : null));
  }
  const att = R.filter(r => r.att), A = Math.max(1, att.length);
  return { n, cmp: att.filter(r => r.comp).length / A, int: att.filter(r => r.int).length / A, sack: R.filter(r => r.sack).length / n, ypa: R.reduce((s, r) => s + r.gain, 0) / n, td: R.filter(r => r.td).length / n };
}
const pct = v => (v * 100).toFixed(0).padStart(3) + '%';
const fmt = s => `comp ${pct(s.cmp)}  INT ${pct(s.int)}  sack ${pct(s.sack)}  ${s.ypa.toFixed(1).padStart(5)} yd/dropback  TD ${pct(s.td)}`;
module.exports = { dropback, run, PROFILES, Sim };

if (require.main === module) {
  const DIFF = ['ROOKIE', 'PRO', 'ALL-PRO'], R = {};
  for (let diff = 0; diff < 3; diff++) {
    R[diff] = {};
    say(`== ${DIFF[diff]} defense (${N} dropbacks per profile, slants/post/bomb/screen, random flip)`);
    for (const prof of Object.keys(PROFILES)) { R[diff][prof] = run(diff, prof, N); say(`    ${prof.padEnd(11)} ${fmt(R[diff][prof])}`); }
    R[diff].sold = run(diff, 'reasonable', Math.round(N / 2), true); say(`    ${'vs SELL OUT'.padEnd(11)} ${fmt(R[diff].sold)}  (reasonable QB, defense read the call)`);
  }
  if (process.env.NOCHECK) process.exit(0);
  say('== passing targets');
  const band = [[0.72, 0.9], [0.63, 0.8], [0.55, 0.74]];
  for (let diff = 0; diff < 3; diff++) {
    const r = R[diff].reasonable, s = R[diff].sold, c = R[diff].casual;
    check(r.cmp >= band[diff][0] && r.cmp <= band[diff][1], `${DIFF[diff]}: a reasonable QB completes ${pct(r.cmp)} (target ${Math.round(band[diff][0] * 100)}-${Math.round(band[diff][1] * 100)}%)`);
    check(r.int <= [0.04, 0.06, 0.08][diff], `${DIFF[diff]}: few picks on normal throws (${pct(r.int)})`);
    check(c.cmp >= band[diff][0] - 0.15, `${DIFF[diff]}: even a casual QB completes ${pct(c.cmp)} (>= ${((band[diff][0] - 0.15) * 100).toFixed(0)}%)`);
    if (diff > 0) check(s.cmp <= r.cmp - 0.2 && (s.int + s.sack) >= 0.1, `${DIFF[diff]}: throwing into a correct sell-out stays risky (comp ${pct(s.cmp)}, INT ${pct(s.int)}, sack ${pct(s.sack)})`);
    check(r.td <= 0.2, `${DIFF[diff]}: touchdowns still have to be earned (TD on ${pct(r.td)} of dropbacks from midfield-ish)`);
  }
  check(R[0].reasonable.cmp > R[2].reasonable.cmp, `easier levels complete more (${pct(R[0].reasonable.cmp)} rookie vs ${pct(R[2].reasonable.cmp)} all-pro)`);
  say(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
}
