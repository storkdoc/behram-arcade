// STAR RAIDER — headless playtest harness: the autopilot plays whole games.
// node tests/sim.test.js [games-per-cell]   -> balance table + sanity asserts
const S = require('../js/sim.js'); global.SRSim = S; const A = require('../js/auto.js');
const N = +process.argv[2] || 6, DT = 1 / 30;
function play(diff, mission, seed, skill, maxT = 1500) {
  const G = S.newGame({ diff, seed, mission }); const p = S.addPlayer(G, 0); const bot = A.make(skill);
  let fires = 0;
  while (!G.over && G.t < maxT) { const inp = bot(G, p, DT); fires += inp.fire | 0; S.stepWorld(G, [inp], DT); }
  if (!G.over) S.end(G, false, 'TIMEOUT');
  return { win: G.over.win, why: G.over.why, t: G.t, rank: G.over.rank, cls: G.over.cls, R: G.over.rating, lost: G.stats.basesLost, deaths: G.stats.deaths, warps: G.stats.warps, docks: G.stats.docks, saves: G.stats.saves || 0, kills: p.kills, wave: G.wave };
}
const out = {};
for (const mission of ['campaign', 'blitz', 'laststand']) for (const skill of [0.35, 1]) for (let d = 0; d < 4; d++) {
  if (mission !== 'campaign' && skill < 1) continue;
  const rs = []; for (let i = 0; i < N; i++) rs.push(play(d, mission, 1000 + i * 77 + d, skill));
  const avg = k => (rs.reduce((a, r) => a + r[k], 0) / rs.length);
  const row = { win: Math.round(avg('win') * 100) + '%', min: (avg('t') / 60).toFixed(1), lost: avg('lost').toFixed(1), deaths: avg('deaths').toFixed(2), warps: avg('warps').toFixed(0), docks: avg('docks').toFixed(1), saves: avg('saves').toFixed(1), R: avg('R').toFixed(0), wave: avg('wave').toFixed(1), ends: [...new Set(rs.map(r => r.why))].join('|').slice(0, 60), rank: rs[0].rank + ' ' + rs[0].cls };
  out[`${mission} ${S.DIFFS[d]} sk${skill}`] = row;
}
console.table(out);
const nov = out['campaign NOVICE sk0.35'], cmdr = out['campaign COMMANDER sk1'];
let fail = 0; const check = (c, m) => { if (!c) { fail++; console.error('FAIL', m); } else console.log('ok', m); };
check(parseInt(nov.win) >= 50, 'a sloppy novice bot wins Novice at least half the time');
check(parseInt(cmdr.win) <= 50, 'even the sharp bot loses Commander at least half the time');
check(parseFloat(cmdr.min) >= 2.5, 'Commander is hard but not a 90-second wipeout (sharp bot lasts 2.5+ min on average)');
check(parseInt(out['campaign WARRIOR sk1'].win) >= 25, 'the sharp bot wins Warrior at least a quarter of the time');
check(parseInt(out['campaign PILOT sk0.35'].win) >= 30, 'a sloppy bot wins Pilot at least about a third of the time (gentler 2nd step, 2026-10-31)');
check(parseInt(out['campaign PILOT sk1'].win) >= 90 && parseInt(out['campaign NOVICE sk0.35'].win) > parseInt(out['campaign PILOT sk0.35'].win), 'Pilot is still a step up from Novice for a sloppy bot, and easy for a sharp one');
{ // emergency reserve: Pilot pulls a solo pilot back once from energy exhaustion; Warrior does not
  const rescueRun = d => { const G = S.newGame({ diff: d, seed: 7, mission: 'campaign' }); const p = S.addPlayer(G, 0); const idle = { thr: 0 };
    const out = []; for (let k = 0; k < 2; k++) { p.energy = 0.01; for (let i = 0; i < 3; i++) S.stepWorld(G, [idle], DT); out.push(p.alive); }
    return { out, msg: G.msgs.some(m => /EMERGENCY RESERVE/.test(m.text)) }; };
  const pl = rescueRun(1), wa = rescueRun(2);
  check(pl.out[0] === true && pl.out[1] === false && pl.msg, 'Pilot: one emergency reserve, then energy exhaustion is fatal (' + JSON.stringify(pl) + ')');
  check(wa.out[0] === false, 'Warrior: no emergency reserve');
}
process.exit(fail ? 1 : 0);
