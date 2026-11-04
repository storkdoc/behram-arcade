/* Trackball Football: the fundamentals package (pure Node, no browser).
   Offense: OFF TACKLE, CURL-FLAT, PLAY-ACTION SEAM.  Defense: COVER 2, COVER 1 LB BLITZ, GOAL LINE.
   Uses the scripted expert human from play-counter.test.js (team 0 calls, CPU team 1 defends) and checks:
     - every new play runs against every defense, flipped and not, without errors or stuck snaps, in a sane yardage range
     - no exploit: the new plays don't out-gain the old book, and the new defenses aren't softer than the old ones
     - SELL OUT has a counter for each new play that stops it when it's right
     - spamming a new play gets read like any other play
     - the CPU calls them sensibly (GOAL LINE near the goal, OFF TACKLE on short yardage, rookie leans on them least)
     - head-to-head: both sides can pick them, unknown ids are refused
   Run from the repo root:  node games/trackball-football/tests/new-plays.test.js   (env: N = snaps per case) */
const PC = require('./play-counter.test.js');
const { snap, series, BOTS, stats, Sim } = PC;
const N = +process.env.N || 50, W = 53.333;
const say = (...a) => console.log(a.join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
const NEW_O = ['offtackle', 'curlflat', 'paseam'], OLD_O = ['dive', 'sweep', 'slants', 'post', 'bomb', 'screen'];
const NEW_D = ['cover2', 'cover1', 'goalline'], OLD_D = ['man', 'zone', 'blitz', 'stuff', 'prevent'];
const avg = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
function cell(o, d, diff, n) { // n snaps of offense o into defense d (forced), fresh scouting each snap
  Sim.newGame({ human: [true, false], diff, half: 900 }); const g = []; let bad = 0, err = null;
  for (let i = 0; i < n; i++) {
    Sim.G.sc[0].h.length = 0;
    try { const r = snap(o, i % 2 === 1, diff, { pick: d, flip: i % 4 >= 2 }); if (r.type === 'timeout') bad++; g.push(r.gain); }
    catch (e) { err = err || e; bad++; }
  }
  return { g: avg(g), bad, err };
}

say('== every new play vs every defense (PRO, flipped and not)');
const M = {}; let bad = 0, firstErr = null;
for (const o of NEW_O.concat(OLD_O)) { M[o] = {}; let line = '    ' + o.padEnd(10);
  for (const d of OLD_D.concat(NEW_D)) {
    const isNew = NEW_O.includes(o) || NEW_D.includes(d);
    const c = cell(o, d, 1, isNew ? N : Math.round(N / 2)); M[o][d] = c.g; bad += c.bad; firstErr = firstErr || c.err;
    line += (d + ' ' + c.g.toFixed(1)).padStart(14);
  }
  say(line);
}
check(bad === 0, `no errors or stuck snaps (${bad}${firstErr ? ': ' + firstErr.message : ''})`);
for (const o of NEW_O) { const v = Object.values(M[o]); check(Math.min(...v) > -4 && Math.max(...v) < 30, `${o}: every matchup in a sane range (${Math.min(...v).toFixed(1)} to ${Math.max(...v).toFixed(1)} yd/play)`); }
const rowAvg = o => avg(OLD_D.concat(NEW_D).map(d => M[o][d]));
const oldPassMax = Math.max(...['slants', 'post', 'bomb', 'screen'].map(rowAvg)), oldRunMax = Math.max(rowAvg('dive'), rowAvg('sweep'));
check(rowAvg('curlflat') <= oldPassMax * 1.1, `CURL-FLAT is no exploit (${rowAvg('curlflat').toFixed(1)} yd/play vs best old pass ${oldPassMax.toFixed(1)})`);
check(rowAvg('paseam') <= oldPassMax * 1.1, `PLAY-ACTION SEAM is no exploit (${rowAvg('paseam').toFixed(1)} vs ${oldPassMax.toFixed(1)})`);
check(rowAvg('offtackle') <= oldRunMax * 1.25 && rowAvg('offtackle') > 1, `OFF TACKLE gains like a run play (${rowAvg('offtackle').toFixed(1)} vs best old run ${oldRunMax.toFixed(1)})`);
const colAvg = d => avg(OLD_O.map(o => M[o][d])), worstOld = Math.max(...OLD_D.map(colAvg));
for (const d of NEW_D) check(colAvg(d) <= worstOld, `${d} is no softer than the old defenses vs the old book (${colAvg(d).toFixed(1)} yd/play, softest old ${worstOld.toFixed(1)})`);
check(M.offtackle.goalline < rowAvg('offtackle') && M.dive.goalline < rowAvg('dive'), `GOAL LINE stops the inside runs (off tackle ${M.offtackle.goalline.toFixed(1)}, dive ${M.dive.goalline.toFixed(1)})`);

say('== SELL OUT against the new plays (correct read, PRO and ALL-PRO)');
for (const diff of [1, 2]) for (const o of NEW_O) {
  Sim.newGame({ human: [true, false], diff, half: 900 }); const g = [];
  for (let i = 0; i < N; i++) { Sim.G.sc[0].h.length = 0; const fl = i % 2 === 1; const r = snap(o, fl, diff, { pick: 'read', k: Sim.callKey(o, fl) }); g.push(r.gain); }
  check(avg(g) < 2, `${['', 'PRO', 'ALL-PRO'][diff]}: a right sell-out stops ${o} (avg ${avg(g).toFixed(1)} yd)`);
}

say('== spamming a new play gets read (PRO)');
for (const o of NEW_O) { const runs = []; for (let i = 0; i < 16; i++) runs.push(series(BOTS.same(o), 1)); const late = stats(runs, 5);
  check(late.g <= 1.5, `same ${o} every snap: avg ${late.g.toFixed(1)} yd/play after play 5 (limit 1.5)`); }

say('== the CPU calls them sensibly');
function picks(diff, team, spot, n) { const c = {};
  for (let i = 0; i < n; i++) { Sim.newGame({ human: [false, false], diff, half: 900 }); Sim.testSpot(0, spot.x, W / 2); Sim.G.down = spot.down; Sim.G.togo = spot.togo; const id = Sim.cpuPick(team); c[id] = (c[id] || 0) + 1 / n; }
  return c; }
const pct = x => ((x || 0) * 100).toFixed(0) + '%';
for (let diff = 0; diff < 3; diff++) {
  const gl = picks(diff, 1, { x: 106, down: 1, togo: 4 }, 300), mid = picks(diff, 1, { x: 45, down: 1, togo: 10 }, 300);
  const sh = picks(diff, 0, { x: 50, down: 3, togo: 1 }, 300), lg = picks(diff, 0, { x: 50, down: 3, togo: 9 }, 300);
  say(`    ${['ROOKIE', 'PRO', 'ALL-PRO'][diff]}: D at the 4: goal line ${pct(gl.goalline)}, prevent ${pct(gl.prevent)} · D 1st&10: cover2 ${pct(mid.cover2)} cover1 ${pct(mid.cover1)} goal line ${pct(mid.goalline)} · O 3rd&1: off tackle ${pct(sh.offtackle)} · O 3rd&9: curl-flat ${pct(lg.curlflat)} seam ${pct(lg.paseam)} off tackle ${pct(lg.offtackle)}`);
  check((mid.goalline || 0) < 0.06, `${diff}: GOAL LINE is rare at midfield (${pct(mid.goalline)})`);
  if (diff > 0) check((gl.goalline || 0) > 0.25 && !gl.prevent, `${diff}: GOAL LINE near the goal, no PREVENT (${pct(gl.goalline)})`);
  check((sh.offtackle || 0) > (lg.offtackle || 0), `${diff}: OFF TACKLE more on 3rd & 1 than 3rd & 9 (${pct(sh.offtackle)} vs ${pct(lg.offtackle)})`);
  check(NEW_O.some(o => lg[o] > 0) && NEW_D.some(d => mid[d] > 0), `${diff}: the CPU uses the new plays at all`);
}

say('== head-to-head picks');
{ Sim.newGame({ human: [true, true], diff: 1, half: 900 }); let ok = 0, n = 0;
  for (const o of NEW_O) for (const d of NEW_D) { Sim.testSpot(0, 45, W / 2); n++; Sim.pick(0, o, true); Sim.pick(1, d, false); if (Sim.G.picks[0] === o && Sim.G.picks[1] === d) ok++; }
  check(ok === n, `both humans can call every new play (${ok}/${n})`);
  Sim.testSpot(0, 45, W / 2); Sim.pick(0, 'fleaflicker', false); Sim.pick(1, 'cover0', false);
  check(Sim.G.picks[0] === 'dive' && Sim.G.picks[1] === 'man', `unknown play ids fall back to the first play (${Sim.G.picks[0]}, ${Sim.G.picks[1]})`); }
say(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
