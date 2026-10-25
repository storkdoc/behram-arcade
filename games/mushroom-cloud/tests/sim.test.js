/* Headless game-logic tests:  node games/mushroom-cloud/tests/sim.test.js */
const S = require('../js/sim.js'); require('../js/ai.js');
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
function run(opts, maxT = 3000, dt = 0.25) { const g = new S.Game(opts); const t0 = Date.now(); let defs = [g.defcon]; while (!g.over && g.t < maxT) { g.step(dt); if (g.defcon !== defs[defs.length - 1]) defs.push(g.defcon); } return { g, defs, ms: Date.now() - t0 }; }
console.log('== AI vs AI matches');
const pers = ['hawk', 'cautious', 'opportunist'];
let deterrence = 0, wars = 0;
for (const sc of ['brink', 'pacific', 'six', 'second']) for (const diff of ['recruit', 'veteran', 'strategist']) {
  const seed = 7 + sc.length * 13 + diff.length;
  const { g, defs, ms } = run({ scenario: sc, seed, difficulty: diff, humans: [] });
  const r = g.result || {};
  if (r.deterrence) deterrence++; else wars++;
  const units = g.units.length;
  console.log('   ', sc.padEnd(8), diff.padEnd(10), 'units', units, 'det', g.detonations, 'dead', Math.round(r.total || 0) + 'M', 'winner', r.winner, r.deterrence ? '(deterrence)' : '', 'T', Math.round(g.t), ms + 'ms', 'pers', g.ai.map(a => a.pers[0]).join(''));
  check(g.over && r && r.blocs, sc + '/' + diff + ' match completes', { t: Math.round(g.t) });
  if (sc !== 'second') check(JSON.stringify(defs) === '[5,4,3,2,1]', sc + '/' + diff + ' DEFCON 5→1 in order', defs);
  check(g.active.every(b => g.units.filter(u => u.bloc === b).length >= 6), sc + '/' + diff + ' every CPU deployed a full order of battle');
  check(g.t > 600 || sc === 'second', 'match length sensible (' + Math.round(g.t / 60) + ' game-min at 1x)');
}
check(wars > 0, 'some AI matches go nuclear', wars);
// cautious vs cautious: nobody shoots first → deterrence ending possible
{ const { g } = run({ scenario: 'brink', seed: 3, difficulty: 'veteran', humans: [], pers: { 0: 'cautious', 1: 'cautious' } });
  check(g.over && g.result.deterrence && g.detonations === 0, 'two cautious blocs → Deterrence victory decided by posture', { det: g.detonations, w: g.result.winner, post: g.result.blocs.map(b => b.post) }); }
// hawk vs cautious: hawk strikes, cautious launches on warning
{ const { g } = run({ scenario: 'brink', seed: 5, difficulty: 'strategist', humans: [], pers: { 0: 'hawk', 1: 'cautious' } });
  check(g.b[0].launched > 0 && g.b[1].launched > 0, 'hawk strikes first, cautious retaliates (launch on warning)', { hawk: g.b[0].launched, cautious: g.b[1].launched });
  const sc = g.result.blocs; check(sc.every(b => b.score === Math.round(2 * b.kills - b.deaths - (g.b[b.id].collateral))), 'score = 2×enemy dead − own dead (millions)', sc.map(b => [b.score, Math.round(b.kills), Math.round(b.deaths)])); }

console.log('== DEFCON phase rules');
{ const g = new S.Game({ scenario: 'brink', seed: 1, difficulty: 'veteran', humans: [0], blocs: [0, 1] });
  check(g.place(0, 'silo', 39, -100).ok, 'place a silo in Kansas at DEFCON 5');
  check(!g.place(0, 'silo', 55, 37).ok, 'cannot place in enemy territory');
  check(!g.place(0, 'sub', 39, -100).ok && g.place(0, 'sub', 36, -70).ok, 'subs only in own waters');
  const silo = g.units.find(u => u.type === 'silo' && u.bloc === 0);
  check(!g.command(0, { op: 'launch', id: silo.id, lat: 55.7, lon: 37.6 }).ok, 'no launches before DEFCON 1');
  check(!g.command(0, { op: 'move', id: g.units.find(u => u.type === 'sub').id, lat: 30, lon: -60 }).ok, 'no fleet movement before DEFCON 3');
  while (g.defcon > 3) g.step(0.5);
  check(!g.place(0, 'radar', 40, -90).ok, 'deployment closes at DEFCON 3');
  const sub = g.units.find(u => u.type === 'sub' && u.bloc === 0);
  const mv = g.command(0, { op: 'move', id: sub.id, lat: 60, lon: -20 }); check(mv.ok && sub.path.length >= 1, 'sub gets an all-water route at DEFCON 3', sub.path && sub.path.length);
  check(sub.path.every((p, i) => S.isWater(p[0], p[1])), 'every waypoint is at sea');
  check(!g.command(0, { op: 'move', id: sub.id, lat: 50, lon: 10 }).ok, 'cannot sail onto land');
  check(g.command(0, { op: 'sat', lat: 55, lon: 40 }).msg !== 'Reconnaissance satellite tasked', 'no satellites before DEFCON 2');
  while (g.defcon > 2) g.step(0.5); check(g.command(0, { op: 'sat', lat: 55, lon: 40 }).ok, 'satellites at DEFCON 2');
  while (g.defcon > 1) g.step(0.5);
  check(!g.command(0, { op: 'launch', id: silo.id, lat: 55.7, lon: 37.6 }).ok, 'silo in DEFENSE mode cannot launch');
  g.command(0, { op: 'mode', id: silo.id, mode: 'launch' }); for (let i = 0; i < 100; i++) g.step(0.25);
  check(silo.mode === 'launch', 'silo switched to LAUNCH mode after a delay');
  const r = g.command(0, { op: 'launch', id: silo.id, lat: 55.7, lon: 37.6 }); check(r.ok, 'launch at DEFCON 1');
  check(silo.rev[1] === Infinity, 'launching silo is revealed to the enemy permanently');
  check(!g.command(0, { op: 'launch', id: silo.id, lat: 40.7, lon: -74 }).ok, 'cannot target own territory');
  check(!g.command(0, { op: 'launch', id: silo.id, lat: -15, lon: -50 }).ok, 'cannot target non-aligned territory');
}
console.log('== interceptor math');
{ // per-shot kill probability: every interceptor that reaches a live warhead kills it with p = pk
  let hit = 0, miss = 0, kills = 0, n = 0;
  for (let s = 1; s <= 80; s++) {
    const g = new S.Game({ scenario: 'brink', seed: s, difficulty: 'veteran', humans: [0, 1] });
    g.place(1, 'sam', 55.6, 37.5); g.place(1, 'radar', 56, 40); g.defcon = 1; g.d1At = 0; g.phaseEnd = 0; g.updateVision();
    const m = g.fire(0, 'icbm', [39, -100], [55.75, 37.6], 60, 0);
    while (m.alive) { g.step(0.1); for (const e of g.events) { if (e.type === 'intercept') hit++; if (e.type === 'miss') miss++; } g.events.length = 0; }
    n++; if (m.killed) kills++;
  }
  const pk = S.UNIT.sam.abmPk, rate = hit / (hit + miss);
  check(Math.abs(rate - pk) < 0.12, 'measured per-interceptor kill rate ' + rate.toFixed(2) + ' ≈ pk ' + pk + ' (' + (hit + miss) + ' shots)');
  check(kills / n > 0.8, 'a single warhead into a radar-covered battery is usually stopped (' + Math.round(kills / n * 100) + '%)');
  // without radar coverage the battery cannot see a long-range warhead early; its own sensor still works
  const g = new S.Game({ scenario: 'brink', seed: 9, difficulty: 'veteran', humans: [0, 1] }); g.place(1, 'sam', 55.6, 37.5); g.defcon = 1; g.d1At = 0; g.updateVision();
  const before = g.units[0].abm; const salvo = []; for (let i = 0; i < 12; i++) salvo.push(g.fire(0, 'icbm', [39, -100], [55.75, 37.6], 60, 0));
  while (salvo.some(m => m.alive)) g.step(0.1);
  const leaked = salvo.filter(m => !m.killed).length; check(leaked >= 4, 'a 12-warhead salvo saturates one battery (' + leaked + ' leak through, ' + (before - g.units[0].abm) + ' interceptors used)');
  check(g.cities.find(c => c.name === 'Moscow').pop < g.cities.find(c => c.name === 'Moscow').pop0, 'leakers kill population (Moscow loses people)');
  // silo in LAUNCH mode does not intercept
  const g2 = new S.Game({ scenario: 'brink', seed: 9, difficulty: 'veteran', humans: [0, 1] }); g2.place(1, 'silo', 55.5, 38.5); g2.place(1, 'radar', 56, 40); g2.defcon = 1; g2.d1At = 0; const s2 = g2.units[0]; s2.mode = 'launch'; g2.updateVision();
  const m2 = g2.fire(0, 'icbm', [39, -100], [55.75, 37.6], 60, 0); while (m2.alive) g2.step(0.1);
  check(m2.shots === 0, 'a silo in LAUNCH mode cannot intercept');
}
console.log('== fog of war');
{ const g = new S.Game({ scenario: 'brink', seed: 4, difficulty: 'veteran', humans: [0], blocs: [0, 1] });
  while (g.defcon > 4) g.step(0.5);
  const v = g.viewFor(0); const theirs = v.units.filter(u => u.bloc === 1);
  const real = g.units.filter(u => u.bloc === 1).length;
  check(real >= 6 && theirs.length < real, 'enemy deployment hidden in my view (' + theirs.length + ' of ' + real + ' visible)');
  check(theirs.every(u => u.wh === undefined && u.abm === undefined && u.path === undefined), 'no enemy stock / routes leak into the view');
  check(!g.viewFor(0).units.some(u => u.bloc === 1 && u.type === 'sub'), 'enemy subs invisible without sonar');
  const vs = JSON.stringify(g.viewFor(1)); check(!/"budget":\s*\d+.*"budget"/.test(vs), 'view carries only my own budget');
  // reveal on launch
  while (g.defcon > 1) g.step(0.5);
  const es = g.units.find(u => u.bloc === 1 && u.type === 'silo'); es.mode = 'launch'; es.pend = null;
  const seenBefore = g.viewFor(0).units.some(u => u.id === es.id);
  g.launchFrom(1, es.id, 40.7, -74); g.updateVision();
  check(g.viewFor(0).units.some(u => u.id === es.id), 'silo that launched is revealed (was ' + (seenBefore ? 'already known' : 'hidden') + ')');
  const ev = g.eventsFor(0, [{ type: 'place', to: [1] }, { type: 'det' }]); check(ev.length === 1 && ev[0].type === 'det', 'private events are filtered per bloc');
}
console.log('== diplomacy');
{ const g = new S.Game({ scenario: 'pacific', seed: 11, difficulty: 'veteran', humans: [0], pers: { 1: 'hawk', 2: 'cautious' } });
  while (g.defcon > 2) g.step(0.5);
  const r = g.command(0, { op: 'diplo', act: 'alliance', target: 2 }); for (let i = 0; i < 20; i++) g.step(0.25);
  check(r.ok && g.b[0].allies.includes(2), 'cautious Pacific Coalition accepts an alliance against the hawk', g.b[0].allies);
  const v = g.viewFor(0); check(v.units.some(u => u.bloc === 2 && u.wh !== undefined), 'allies share full vision');
  const t0 = g.b[1].fear[0]; g.command(0, { op: 'diplo', act: 'force', target: 1 }); check(g.b[1].fear[0] > t0, 'show of force raises their fear');
  g.command(0, { op: 'diplo', act: 'standdown' }); check(g.b[0].standDownUntil > g.t && !g.command(0, { op: 'mode', id: g.units.find(u => u.bloc === 0 && u.type === 'silo') ? g.units.find(u => u.bloc === 0 && u.type === 'silo').id : -1, mode: 'launch' }).ok, 'stand-down locks silos in defense');
}
console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS'); process.exit(fails ? 1 : 0);
