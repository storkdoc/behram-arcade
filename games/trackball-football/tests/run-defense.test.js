/* Trackball Football: "can't just run it in every play" regression (pure Node, no browser).
   Loads plays.js + sim.js headlessly and lets scripted human ball carriers try the classic exploits
   (run straight, bounce to the sideline, zig-zag, retreat-then-around, QB scramble) with full trackball spin,
   juke on cooldown and Space-mashing in every tackle. Asserts the per-play TD rate stays low on every level,
   that a skilled, evasive runner still breaks one now and then, that passing beats running, and that the
   same rules hold for both teams (2P).
   Run from the repo root:  node games/trackball-football/tests/run-defense.test.js   (env: N = plays per case) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.join(__dirname, '..', 'js');
function load() {
  const ctx = { console, Math, performance: { now: () => 0 } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'plays.js'), 'utf8') + '\n' + fs.readFileSync(path.join(DIR, 'sim.js'), 'utf8') + '\nthis.Sim = Sim; this.STEP = STEP;', ctx);
  return ctx;
}
const C = load(), Sim = C.Sim, STEP = C.STEP, W = 53.333;
const N = +process.env.N || 160;
const say = (...a) => console.log(a.join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };

// ---- scripted human runners. Each returns a unit-ish steering vector in field coords (x toward their goal = +d)
const STRATS = {
  straight: (me, d, t, s) => ({ x: d, y: 0 }),
  sideline: (me, d, t, s) => { const side = s.side || (s.side = me.y < W / 2 ? -1 : 1); const edge = side < 0 ? 2.5 : W - 2.5; return Math.abs(me.y - edge) > 1.5 ? { x: d * 0.55, y: side } : { x: d, y: 0 }; },
  zigzag: (me, d, t) => ({ x: d * 0.8, y: Math.sin(t * 3.4) > 0 ? 0.75 : -0.75 }),
  around: (me, d, t, s) => { const side = s.side || (s.side = me.y < W / 2 ? -1 : 1); return t - s.t0 < 1.3 ? { x: -d * 0.55, y: side } : STRATS.sideline(me, d, t, s); },
  evasive: (me, d, t, s, G) => { // a decent player: aims for daylight, cuts away from the closest threats, jukes on contact
    let vx = d, vy = 0;
    for (const q of G.pl) { if (q.team === me.team || q.st === 'down' || q.eng >= 0) continue;
      const dx = me.x - q.x, dy = me.y - q.y, dist = Math.hypot(dx, dy); if (dist > 10) continue;
      const ahead = (q.x - me.x) * d > -1 ? 1 : 0.3, w = ahead * 4 / Math.max(0.5, dist * dist);
      vy += dy / dist * w * 1.3; vx += dx / dist * w * 0.25; }
    if (me.y < 3) vy += 0.6; if (me.y > W - 3) vy -= 0.6; if (vx * d < 0.2) vx = d * 0.2; return { x: vx, y: vy };
  },
};
const PLAYS = { dive: 'dive', sweep: 'sweep', scramble: 'post' };

/** one offensive snap by `team` (human) vs a CPU (or scripted human) defense; returns { td, gain, type } */
function runPlay(strat, playKey, opts) {
  const team = opts.team || 0, two = !!opts.twoP;
  if (!opts.keep || !Sim.G) Sim.newGame({ human: two ? [true, true] : team === 0 ? [true, false] : [false, true], diff: opts.diff, half: 900 });
  const G = Sim.G, d = team === 0 ? 1 : -1, def = 1 - team;
  const blank = () => ({ x: 0, y: 0, m: 0, aP: false, bP: false });
  // ball on the offense's own 35, between the hashes (a 75-yard field to the end zone)
  G.clock = 900; Sim.testSpot(team, team === 0 ? 45 : 75, W / 2 + (Math.random() - 0.5) * 6);
  Sim.pick(team, PLAYS[playKey], Math.random() < 0.5);
  if (two) Sim.pick(def, opts.defCall || ['man', 'zone', 'blitz', 'stuff', 'prevent'][Math.floor(Math.random() * 5)], Math.random() < 0.5);
  const s = { t0: 0 }; let started = false, mashT = 0, jukeT = 0;
  for (let k = 0; k < 60 * 30; k++) {
    const inp = [blank(), blank()];
    if (G.phase === 'presnap') { if (G.t > 0.8) inp[team].aP = true; }
    else if (G.phase === 'live') {
      const me = G.pl[G.ctl[team]], c = Sim.carrier();
      if (!started && c && c.team === team && (c.role !== 'QB' || playKey === 'scramble')) { started = true; s.t0 = G.t; }
      let v = { x: d, y: 0 };
      if (me.role === 'QB' && playKey !== 'scramble' && !G.run) v = { x: 0, y: 0 };
      else if (started) v = STRATS[strat](me, d, G.t, s, G);
      const n = Math.hypot(v.x, v.y) || 1, m = v.x || v.y ? 1.15 : 0;
      inp[team] = { x: v.x / n * m, y: v.y / n * m, m, aP: false, bP: false };
      // juke near a defender, mash out of every tackle
      if (c === me && !(me.role === 'QB' && G.kind === 'pass' && !G.crossed)) { // (a QB's Space before the line is a throw)
        if (G.wrap && G.wrap.c === me.i) { if (G.t - mashT > 0.16) { inp[team].aP = true; mashT = G.t; } }
        else if (opts.juke !== false && G.t - jukeT > 1.02) {
          let near = 99; for (const q of G.pl) if (q.team !== team && q.st === 'ok' && q.eng < 0) near = Math.min(near, Math.hypot(q.x - me.x, q.y - me.y));
          // naive bots juke whenever anybody is close; the evasive bot waits for the 1.3-2.2 yd sweet spot
          // (opts.jukeWhen: a custom trigger, e.g. the helmet-cam bot that only jukes on what the HELMET CAM shows it)
          if (opts.jukeWhen ? opts.jukeWhen(G, me, team, near) : strat === 'evasive' ? near > 1.3 && near < 2.2 : near < 3.2) { inp[team].aP = true; jukeT = G.t; }
        }
      }
      if (two) { // scripted human defender: chases with the selected man, presses to grab the closest, dives in range
        const dm = G.pl[G.ctl[def]], cc = Sim.carrier();
        if (cc && cc.team === team) {
          const dx = cc.x - dm.x, dy = cc.y - dm.y, dist = Math.hypot(dx, dy) || 1;
          inp[def] = { x: dx / dist * 1.15, y: dy / dist * 1.15, m: 1.15, aP: Math.random() < 0.08, bP: false };
        }
      }
    } else if (G.phase === 'result') {
      const r = G.result || {}; const gain = r.x != null ? (r.x - G.los) * d : 0;
      return { td: r.type === 'td' && r.team === team, type: r.type, gain: r.type === 'td' ? 99 : gain, started };
    }
    Sim.update(STEP, inp);
  }
  return { td: false, type: 'timeout', gain: 0 };
}
function rate(strat, play, opts, n) {
  let td = 0, g = 0, cnt = 0, gains = [];
  for (let i = 0; i < n; i++) { const r = runPlay(strat, play, opts); if (r.type === 'incomplete' || r.type === 'timeout') continue; cnt++; if (r.td) td++; gains.push(Math.min(r.gain, 65)); }
  gains.sort((a, b) => a - b);
  return { td: td / Math.max(1, cnt), avg: gains.reduce((a, b) => a + b, 0) / Math.max(1, cnt), med: gains[gains.length >> 1] || 0, n: cnt };
}
module.exports = { runPlay, rate, Sim, STRATS };

if (require.main === module) {
  const DIFF = ['ROOKIE', 'PRO', 'ALL-PRO'];
  const pct = x => (x * 100).toFixed(1) + '%';
  const LIMIT = [0.12, 0.08, 0.06]; // naive exploits: max per-play TD rate by level
  let maxNaive = 0;
  for (let diff = 0; diff < 3; diff++) {
    say(`== ${DIFF[diff]}: naive exploits (human runs, full spin, juke + mash)`);
    const naive = { td: 0, n: 0 };
    for (const strat of ['straight', 'sideline', 'zigzag', 'around']) for (const play of ['dive', 'sweep', 'scramble']) {
      const r = rate(strat, play, { diff }, N);
      naive.td += r.td * r.n; naive.n += r.n;
      say(`    ${strat.padEnd(8)} ${play.padEnd(8)} TD ${pct(r.td).padStart(6)}  avg ${r.avg.toFixed(1)} yd  median ${r.med.toFixed(1)} yd  (${r.n})`);
    }
    const nr = naive.td / naive.n; maxNaive = Math.max(maxNaive, nr);
    check(nr <= LIMIT[diff], `${DIFF[diff]}: naive run exploits score on ${pct(nr)} of plays (limit ${pct(LIMIT[diff])})`);
    const ev = rate('evasive', 'sweep', { diff }, N), ev2 = rate('evasive', 'dive', { diff }, N);
    say(`    evasive  sweep TD ${pct(ev.td)} avg ${ev.avg.toFixed(1)} | dive TD ${pct(ev2.td)} avg ${ev2.avg.toFixed(1)}`);
    if (diff === 0) check(ev.td + ev2.td > 0.005, 'ROOKIE: a skilled evasive runner can still break a long one sometimes');
    check((ev.td + ev2.td) / 2 <= LIMIT[diff] * 1.6, `${DIFF[diff]}: even the evasive bot is not a TD machine (${pct((ev.td + ev2.td) / 2)})`);
    check(Math.max(ev.avg, ev2.avg) > 2, `${DIFF[diff]}: running still gains yards (avg ${Math.max(ev.avg, ev2.avg).toFixed(1)} yd)`);
  }
  say('== fairness: team 1 (OUTLAWS) attacking the other way, and a 2P game with a human defender');
  const t1 = rate('straight', 'sweep', { diff: 1, team: 1 }, N), t1b = rate('sideline', 'dive', { diff: 1, team: 1 }, N);
  check((t1.td + t1b.td) / 2 <= LIMIT[1], `OUTLAWS runner gets the same treatment (${pct(t1.td)} / ${pct(t1b.td)})`);
  const p2 = rate('sideline', 'sweep', { diff: 1, twoP: true }, N), p2b = rate('straight', 'scramble', { diff: 1, twoP: true, team: 1 }, N);
  check((p2.td + p2b.td) / 2 <= 0.12, `2P: a human runner vs a human-led defense (${pct(p2.td)} / ${pct(p2b.td)})`);
  say(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
}
