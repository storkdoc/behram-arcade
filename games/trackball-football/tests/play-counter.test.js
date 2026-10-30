/* Trackball Football: "the defense learns your play calls" (pure Node, no browser).
   Scripted human offenses call plays against the CPU defense, snap after snap, from the same spot (own 35,
   1st & 10) so every play counts the same, with the scouting history carried from one snap to the next:
     same   - always calls the same play (one bot per play in the book)
     alt    - alternates two plays (A, B, A, B, ...)
     random - a random play and a random flip every snap
     adapt  - an anti-adaptive human: rides a favourite until the defense sells out against it (or warns that it has
              seen it), then switches to whatever beats that counter
   The ball carrier, QB and receivers are played like a decent human: QB throws to the most open of the play's
   targets after a short drop (the screen goes to the back, the bomb deep), runners steer for daylight and time their jukes. Asserts the balance targets: predictable offenses get
   stopped (average <= ~1 yd/play once the defense has caught on, usually within 3-5 plays), varied ones keep
   gaining (4-12 yd/play on Pro for this expert bot), break big plays and finish drives, a rookie defense adapts more slowly than an all-pro one, the
   defense never sees the current call, and a wrong guess gets punished.
   Run from the repo root:  node games/trackball-football/tests/play-counter.test.js   (env: GAMES = series per case, PLAYS = snaps per series) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.join(__dirname, '..', 'js');
const ctx = { console, Math, performance: { now: () => 0 } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(DIR, 'plays.js'), 'utf8') + '\n' + fs.readFileSync(path.join(DIR, 'sim.js'), 'utf8') + '\nthis.Sim = Sim; this.STEP = STEP; this.COUNTER = COUNTER;', ctx);
const Sim = ctx.Sim, STEP = ctx.STEP, W = 53.333;
const GAMES = +process.env.GAMES || 40, PLAYS = +process.env.PLAYS || 12;
const say = (...a) => console.log(a.join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
const PLAYBOOK = ['dive', 'sweep', 'slants', 'post', 'bomb', 'screen'];
// what a smart human calls once the defense sold out against X (the counter's soft spot)
const BEATS = { sweep: ['post', 'dive', 'slants'], dive: ['sweep', 'post', 'bomb'], slants: ['post', 'bomb', 'sweep'], post: ['dive', 'sweep', 'screen'], bomb: ['slants', 'dive', 'screen'], screen: ['post', 'bomb', 'dive'] };

function steer(G, me, d) { // a decent runner: daylight, away from the closest threats
  let vx = d, vy = 0;
  for (const q of G.pl) { if (q.team === me.team || q.st === 'down' || q.eng >= 0) continue;
    const dx = me.x - q.x, dy = me.y - q.y, dist = Math.hypot(dx, dy); if (dist > 10) continue;
    const ahead = (q.x - me.x) * d > -1 ? 1 : 0.3, w = ahead * 4 / Math.max(0.5, dist * dist);
    vy += dy / dist * w * 1.3; vx += dx / dist * w * 0.25; }
  if (me.y < 3) vy += 0.6; if (me.y > W - 3) vy -= 0.6; if (vx * d < 0.2) vx = d * 0.2; return { x: vx, y: vy };
}
// the play's design: who a human looks for on each pass (a screen goes to the back, a bomb goes deep)
const READS = { slants: [5, 6, 4], post: [5, 6, 4], bomb: [5, 6], screen: [4] };
/** the human QB's read: the most open man among the play's targets (space to the nearest defender, a bit of depth) */
function readTarget(G, id) {
  const list = READS[id] || [4, 5, 6]; let best = list[0], bs = -1e9;
  for (const i of list) { const r = G.pl[i]; if (r.st !== 'ok') continue; let sp = 99;
    for (const q of G.pl) if (q.team === 1 && q.st === 'ok') sp = Math.min(sp, Math.hypot(q.x - r.x, q.y - r.y));
    const sc = Math.min(sp, 6) + (r.x - G.los) * 0.04; if (sc > bs) { bs = sc; best = i; } }
  return best;
}
/** one snap: the human (team 0) calls `id` (flip) from its own 35; returns { gain, td, type, ctr, hit, res } */
function snap(id, flip, diff, force, spot) {
  const G = Sim.G, team = 0, d = 1;
  G.clock = 900; G.half = 1; G.score = [0, 0];
  Sim.testSpot(team, spot ? spot.x : 45, W / 2 + (Math.random() - 0.5) * 6);
  if (spot) { G.down = spot.down; G.togo = spot.togo; }
  if (force) { G.picks[1] = force.pick; G.readK[1] = force.k || null; G.pflip[1] = !!force.flip; }
  const hint = G.hint ? G.hint.o : '', sold = G.picks[1] === 'read' ? G.readK[1] : null;
  Sim.pick(team, id, flip);
  const blank = () => ({ x: 0, y: 0, m: 0, aP: false, bP: false });
  let throwAt = (id === 'screen' ? 1.35 : id === 'bomb' ? 1.9 : 1.0) + Math.random() * (id === 'bomb' ? 0.8 : 0.6), jukeT = -9, mashT = -9;
  for (let k = 0; k < 60 * 30; k++) {
    const inp = [blank(), blank()];
    if (G.phase === 'presnap') { if (G.t > 0.8) inp[0].aP = true; }
    else if (G.phase === 'live') {
      const me = G.pl[G.ctl[0]], c = Sim.carrier();
      let v = { x: d, y: 0 };
      const qbPass = me.role === 'QB' && G.kind === 'pass' && !G.thrown && !G.crossed;
      if (qbPass) { // drop back, throw to the most open man (auto-aim) after the read, earlier under pressure
        v = G.t < (id === 'bomb' || id === 'screen' ? 0.75 : 0.45) ? { x: -d, y: 0 } : { x: 0, y: 0 }; // take the drop, then set up
        let near = 99; for (const q of G.pl) if (q.team === 1 && q.st === 'ok' && q.eng < 0) near = Math.min(near, Math.hypot(q.x - me.x, q.y - me.y));
        if (G.t > throwAt || (near < 2.2 && G.t > 0.6)) { G.aim[0] = readTarget(G, id); inp[0].aP = true; }
      } else if (me.role === 'QB' && G.kind === 'run' && !G.run) v = { x: 0, y: 0 };
      else if (c === me) v = steer(G, me, d);
      let m = v.x || v.y ? 1.15 : 0;
      if (G.ball.st === 'air' && G.ball.tgt === me.i) { // time the arrival at the catch point (don't run past it)
        const b = G.ball; v = { x: b.tx - me.x, y: b.ty - me.y }; const dist = Math.hypot(v.x, v.y), left = Math.max(0.05, b.T - b.t);
        m = dist < 0.3 ? 0 : Math.min(1.15, 1.15 * (dist / left) / 8.5 + 0.1);
      }
      const n = Math.hypot(v.x, v.y) || 1;
      inp[0] = Object.assign(inp[0], { x: v.x / n * m, y: v.y / n * m, m });
      if (c === me && !qbPass) {
        if (G.wrap && G.wrap.c === me.i) { if (G.t - mashT > 0.16) { inp[0].aP = true; mashT = G.t; } }
        else if (G.t - jukeT > 1.02) { let near = 99; for (const q of G.pl) if (q.team === 1 && q.st === 'ok' && q.eng < 0) near = Math.min(near, Math.hypot(q.x - me.x, q.y - me.y)); if (near > 1.3 && near < 2.2) { inp[0].aP = true; jukeT = G.t; } }
      }
    } else if (G.phase === 'result') {
      const r = G.result || {}, toGoal = 110 - G.los;
      let gain = r.x != null && (r.type === 'tackle' || r.type === 'oob') && r.team === 0 ? (r.x - G.los) : 0;
      if (r.type === 'td' && r.team === 0) gain = toGoal;
      const pick = (r.type === 'tackle' || r.type === 'oob' || r.type === 'td') && r.team === 1;
      return { gain, td: r.type === 'td' && r.team === 0, pick, type: r.type, sold, hit: !!(G.ctr && G.ctr.hit), ctr: !!G.ctr, res: G.ctr && G.ctr.res, hint };
    }
    Sim.update(STEP, inp);
  }
  return { gain: 0, td: false, type: 'timeout', sold, ctr: false, hint };
}
/** a series of `PLAYS` snaps by one bot against a fresh defense */
function series(bot, diff) {
  Sim.newGame({ human: [true, false], diff, half: 900 });
  const st = { fav: null, i: 0 }, out = [];
  for (let n = 0; n < PLAYS; n++) {
    const [id, flip] = bot(st, n, Sim.G);
    const r = snap(id, flip, diff); r.id = id; r.flip = flip; out.push(r); st.last = r;
  }
  return out;
}
/** a whole drive from the own 25 (real downs; it goes for it on 4th): 'td', 'to' (turnover) or 'downs' */
function drive(bot, diff) {
  Sim.newGame({ human: [true, false], diff, half: 900 });
  const st = { fav: null, i: 0 }; let x = 35, down = 1, togo = 10;
  for (let n = 0; n < 30; n++) {
    const [id, flip] = bot(st, n, Sim.G);
    const r = snap(id, flip, diff, null, { x, down, togo }); st.last = r;
    if (r.td) return 'td';
    if (r.pick || (r.type === 'recover' && Sim.G.result && Sim.G.result.team === 1) || r.type === 'safety') return 'to';
    x += r.gain; togo -= r.gain;
    if (togo <= 0) { down = 1; togo = Math.min(10, 110 - x); } else if (++down > 4) return 'downs';
  }
  return 'downs';
}
const BOTS = {
  same: play => () => [play, false],
  alt: (a, b) => (st, n) => [n % 2 ? b : a, false],
  random: () => () => [PLAYBOOK[Math.floor(Math.random() * PLAYBOOK.length)], Math.random() < 0.5],
  adapt: () => (st, n, G) => {
    if (!st.fav) st.fav = PLAYBOOK[Math.floor(Math.random() * PLAYBOOK.length)];
    const L = st.last, warned = G.hint && G.hint.o;
    if (L && L.ctr) { // the D sold out last snap (the calls show at the snap): attack what that counter gave up
      const f = Sim.G.sc[0].h.length ? (L.sold || '').replace(/[<>]$/, '') : '';
      const opts = BEATS[f] || PLAYBOOK; st.fav = opts[Math.floor(Math.random() * opts.length)]; st.flip = Math.random() < 0.5;
    } else if (warned || (st.run || 0) >= 2) { const o = PLAYBOOK.filter(p => p !== st.fav); st.fav = o[Math.floor(Math.random() * o.length)]; st.flip = Math.random() < 0.5; st.run = 0; }
    st.run = (st.run || 0) + 1;
    return [st.fav, !!st.flip];
  },
};
function stats(runs, from) {
  const all = runs.flatMap(s => s.slice(from || 0));
  const g = all.reduce((a, r) => a + r.gain, 0) / all.length, td = all.filter(r => r.td).length / all.length;
  const ctr = all.filter(r => r.ctr).length / all.length, hit = all.filter(r => r.ctr && r.hit).length / Math.max(1, all.filter(r => r.ctr).length);
  const big = all.filter(r => r.gain >= 20).length / all.length;
  const loss = all.filter(r => r.gain < 0 || r.pick).length / all.length, pick = all.filter(r => r.pick).length / all.length;
  // plays until adapted: first snap where the defense sold out and was right
  const firsts = runs.map(s => { const k = s.findIndex(r => r.ctr && r.hit); return k < 0 ? null : k + 1; }).filter(x => x != null);
  const adapt = firsts.length ? firsts.reduce((a, b) => a + b, 0) / firsts.length : null;
  return { g, td, big, ctr, hit, loss, pick, adapt, adaptN: firsts.length / runs.length };
}
const fmt = s => `avg ${s.g.toFixed(1).padStart(5)} yd  TD ${(s.td * 100).toFixed(1).padStart(4)}%  loss/TO ${(s.loss * 100).toFixed(0).padStart(3)}%  INT ${(s.pick * 100).toFixed(0).padStart(2)}%  sold out ${(s.ctr * 100).toFixed(0).padStart(3)}% (right ${(s.hit * 100).toFixed(0).padStart(3)}%)` + (s.adapt != null ? `  adapted by play ${s.adapt.toFixed(1)} (${(s.adaptN * 100).toFixed(0)}%)` : '');
function run(label, mk, diff) { const runs = []; for (let i = 0; i < GAMES; i++) runs.push(series(mk(), diff)); const s = stats(runs), late = stats(runs, 5); say(`    ${label.padEnd(16)} ${fmt(s)}  | after play 5: avg ${late.g.toFixed(1)} yd`); return { all: s, late, runs }; }
module.exports = { snap, series, drive, BOTS, stats, Sim };

if (require.main === module) {
  const DIFF = ['ROOKIE', 'PRO', 'ALL-PRO'], R = {};
  for (let diff = 0; diff < 3; diff++) {
    say(`== ${DIFF[diff]} defense (${GAMES} series x ${PLAYS} snaps per bot)`);
    const r = R[diff] = { same: {}, alt: {} };
    for (const p of PLAYBOOK) r.same[p] = run('same ' + p, () => BOTS.same(p), diff);
    for (const [a, b] of [['sweep', 'dive'], ['slants', 'post'], ['dive', 'bomb']]) r.alt[a + '/' + b] = run(`alt ${a}/${b}`, () => BOTS.alt(a, b), diff);
    r.random = run('random mix', () => BOTS.random(), diff);
    r.adapt = run('anti-adaptive', () => BOTS.adapt(), diff);
    // whole drives from the own 25 with real downs: does mixing it up still score?
    r.drives = {};
    for (const [lab, mk] of [['random mix', () => BOTS.random()], ['anti-adaptive', () => BOTS.adapt()], ['same sweep', () => BOTS.same('sweep')], ['same post', () => BOTS.same('post')], ['alt sweep/dive', () => BOTS.alt('sweep', 'dive')]]) {
      const c = { td: 0, to: 0, downs: 0 }, N = Math.max(10, GAMES); for (let i = 0; i < N; i++) c[drive(mk(), diff)]++;
      r.drives[lab] = c.td / N; say(`    drives: ${lab.padEnd(15)} TD on ${(100 * c.td / N).toFixed(0).padStart(3)}% of drives, turnover ${(100 * c.to / N).toFixed(0).padStart(3)}%`);
    }
  }
  module.exports.R = R;
  if (process.env.NOCHECK) process.exit(0);
  say('== balance targets');
  for (let diff = 0; diff < 3; diff++) {
    const r = R[diff], sameLate = Object.values(r.same).map(x => x.late.g), altLate = Object.values(r.alt).map(x => x.late.g);
    const sameAvg = sameLate.reduce((a, b) => a + b, 0) / sameLate.length, altAvg = altLate.reduce((a, b) => a + b, 0) / altLate.length;
    // a rookie defense reads you too, but its counters are slower and leakier (the RB in the flat still outruns it):
    // there, a repeated play only has to gain well under half of what a varied offense does
    const lim = diff === 0 ? Math.round(4 * Math.min(r.random.all.g, r.adapt.all.g)) / 10 : [0, 1.0, 0.5][diff];
    check(sameAvg <= lim, `${DIFF[diff]}: same-play offenses are stopped once read (avg ${sameAvg.toFixed(1)} yd/play after play 5, limit ${lim})`);
    check(altAvg <= lim + 0.5, `${DIFF[diff]}: alternating two plays gets read too (avg ${altAvg.toFixed(1)} yd/play after play 5, limit ${lim + 0.5})`);
    const rnd = r.random.all, ad = r.adapt.all;
    // (the scripted human is an expert: perfect drop, instant read, juke timing. Real players gain less; see README)
    const band = [[5, 18], [4, 12], [3, 10]][diff];
    check(rnd.g >= band[0] && rnd.g <= band[1], `${DIFF[diff]}: a random mix still moves the ball (${rnd.g.toFixed(1)} yd/play, target ${band[0]}-${band[1]})`);
    check(ad.g >= band[0] && ad.g <= band[1], `${DIFF[diff]}: an anti-adaptive caller moves the ball (${ad.g.toFixed(1)} yd/play, target ${band[0]}-${band[1]})`);
    const dv = r.drives, varied = (dv['random mix'] + dv['anti-adaptive']) / 2, same = (dv['same sweep'] + dv['same post'] + dv['alt sweep/dive']) / 3;
    check(varied >= 0.25, `${DIFF[diff]}: varied offenses score sometimes (TD on ${(varied * 100).toFixed(0)}% of drives from the own 25)`);
    if (diff > 0) check(same <= varied * 0.5, `${DIFF[diff]}: predictable drives score far less often (${(same * 100).toFixed(0)}% vs ${(varied * 100).toFixed(0)}%)`);
    check(rnd.big > 0.05 && ad.big > 0.05, `${DIFF[diff]}: varied offenses still hit big plays (20+ yd on ${(rnd.big * 100).toFixed(1)}% / ${(ad.big * 100).toFixed(1)}% of snaps; TD ${(rnd.td * 100).toFixed(1)}%)`);
    const sameAdapt = Object.values(r.same).map(x => x.all.adapt).filter(x => x != null), sa = sameAdapt.reduce((a, b) => a + b, 0) / sameAdapt.length;
    if (diff > 0) check(sa >= 3 && sa <= 5.5, `${DIFF[diff]}: the defense catches on to a repeated play by about play 3-5 (avg first right sell-out on play ${sa.toFixed(1)})`);
    R[diff].sa = sa;
  }
  check(R[0].sa > R[2].sa, `a rookie defense adapts more slowly than an all-pro one (play ${R[0].sa.toFixed(1)} vs ${R[2].sa.toFixed(1)})`);
  // a wrong guess is a real risk: when the D sold out and the offense called something else, it gains more than vs a normal call
  for (let diff = 1; diff < 3; diff++) {
    const all = R[diff].random.runs.concat(R[diff].adapt.runs).flat();
    const wrong = all.filter(r => r.ctr && !r.hit), normal = all.filter(r => !r.ctr), right = all.filter(r => r.ctr && r.hit);
    const avg = a => a.reduce((s, r) => s + r.gain, 0) / Math.max(1, a.length);
    say(`    ${DIFF[diff]}: vs a wrong sell-out ${avg(wrong).toFixed(1)} yd (${wrong.length}), vs a normal call ${avg(normal).toFixed(1)} yd (${normal.length}), vs a right one ${avg(right).toFixed(1)} yd (${right.length})`);
    check(avg(wrong) > avg(normal), `${DIFF[diff]}: guessing wrong costs the defense (${avg(wrong).toFixed(1)} vs ${avg(normal).toFixed(1)} yd)`);
    check(avg(right) < 1, `${DIFF[diff]}: a correct read usually ends in a loss, sack or incompletion (avg ${avg(right).toFixed(1)} yd)`);
  }
  // the defense never sees the call: its SELL OUT target is fixed before the offense picks
  { Sim.newGame({ human: [true, false], diff: 2, half: 900 }); let peek = 0, n = 0;
    for (let i = 0; i < 60; i++) { const G = Sim.G; Sim.testSpot(0, 45, W / 2); const before = G.picks[1] + '|' + G.readK[1];
      Sim.pick(0, PLAYBOOK[i % 6], i % 4 === 0); if (G.picks[1] + '|' + G.readK[1] !== before) peek++; n++;
      G.sc[0].h.push({ id: 'sweep', f: false, k: 'sweep>' }); }
    check(peek === 0, `the defense commits before the offense calls (${peek} of ${n} changed after the call)`); }
  say(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
}
