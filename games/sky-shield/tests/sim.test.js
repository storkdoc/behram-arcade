// Headless rules tests: node games/sky-shield/tests/sim.test.js
const assert = require('assert');
const S = require('../js/sim.js');
const { createAuto } = require('../js/auto.js');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); } }
const toPlay = g => { while (g.phase !== 'play') S.step(g, null); };
const run = (g, sec, inp) => { const evs = []; for (let i = 0; i < sec * 60; i++) { S.step(g, typeof inp === 'function' ? inp(g) : inp || null); evs.push(...g.events); } return evs; };

test('same seed -> identical wave schedules (versus fairness)', () => {
  const a = S.createGame({ seed: 1234, startWave: 3 }), b = S.createGame({ seed: 1234, startWave: 3 });
  assert.deepStrictEqual(a.sched.list, b.sched.list);
  const c = S.createGame({ seed: 999, startWave: 3 }); assert.notDeepStrictEqual(a.sched.list, c.sched.list);
});
test('difficulty rises each wave; multiplier x1..x6', () => {
  for (let n = 1; n < 20; n++) { const p = S.waveParams(n), q = S.waveParams(n + 1); assert(q.spd >= p.spd); assert(q.icbms >= p.icbms); }
  assert.strictEqual(S.waveParams(1).mult, 1); assert.strictEqual(S.waveParams(4).mult, 2); assert.strictEqual(S.waveParams(11).mult, 6); assert.strictEqual(S.waveParams(30).mult, 6);
  assert(S.waveParams(6).smart > 0 && S.waveParams(2).flyers > 0 && S.waveParams(2).mirvP > 0);
});
test('fire: interceptor flies to the crosshair and blasts there; ammo drops', () => {
  const g = S.createGame({ seed: 5 }); toPlay(g);
  S.step(g, { cx: 80, cy: 80, fire: [1] }); const evs = g.events.slice();
  assert(evs.some(e => e.e === 'launch' && e.base === 1)); assert.strictEqual(g.bases[1].ammo, 9);
  const ev2 = run(g, 2, { cx: 80, cy: 80 }); const bl = ev2.find(e => e.e === 'blast' && e.kind === 'abm');
  assert(bl && Math.abs(bl.x - 80) < 0.01 && Math.abs(bl.y - 80) < 0.01);
});
test('Space (best base) chooses the quickest battery', () => {
  const g = S.createGame({ seed: 5 }); toPlay(g);
  assert.strictEqual(S.bestBase(g, 10, 60), 0); assert.strictEqual(S.bestBase(g, 150, 60), 2); assert.strictEqual(S.bestBase(g, 80, 100), 1);
  g.bases[0].ammo = 0; assert.notStrictEqual(S.bestBase(g, 10, 60), 0);
});
test('empty battery is dry, LOW and OUT warnings fire', () => {
  const g = S.createGame({ seed: 5 }); toPlay(g); const evs = [];
  for (let i = 0; i < 11; i++) { S.step(g, { cx: 20, cy: 100, fire: [0] }); evs.push(...g.events); }
  assert(evs.some(e => e.e === 'low')); assert(evs.some(e => e.e === 'out')); assert(evs.some(e => e.e === 'dry')); assert.strictEqual(g.bases[0].ammo, 0);
});
test('blasts kill foes and score with the wave multiplier; chains send attacks', () => {
  const g = S.createGame({ seed: 8, startWave: 5 }); toPlay(g);
  g.foes.length = 0; g.sched.list.length = 0;
  for (let i = 0; i < 4; i++) g.foes.push({ id: 900 + i, kind: 'icbm', x: 79 + i * 0.5, y: 90, x0: 80, y0: 128, tx: 80, ty: 1, vx: 0, vy: -0.0001, spd: 0.0001, born: 0, dodge: 0 });
  const before = g.score; const evs = run(g, 1.5, { cx: 80, cy: 90, fire: [1] });
  assert(evs.filter(e => e.e === 'kill').length >= 4);
  assert(g.score - before >= 4 * 25 * S.waveParams(5).mult, 'score ' + (g.score - before));
  assert(g.outAtk >= 2, 'outAtk ' + g.outAtk); assert(evs.some(e => e.e === 'chain'));
});
test('MIRV splits into several warheads', () => {
  const g = S.createGame({ seed: 3, startWave: 8 }); toPlay(g); const evs = run(g, 40);
  const sp = evs.filter(e => e.e === 'split'); assert(sp.length > 0); assert(sp.every(e => e.n >= 2));
});
test('bombers / satellites appear and drop bombs', () => {
  const g = S.createGame({ seed: 4, startWave: 6 }); toPlay(g); const evs = run(g, 60);
  assert(evs.some(e => e.e === 'flyer' && e.kind === 'bomber') || evs.some(e => e.e === 'flyer' && e.kind === 'sat')); assert(evs.some(e => e.e === 'drop'));
});
test('smart bombs dodge nearby blasts', () => {
  const g = S.createGame({ seed: 4, startWave: 9 }); toPlay(g); g.sched.list.length = 0; g.foes.length = 0;
  const f = { id: 77, kind: 'smart', x: 80, y: 70, x0: 80, y0: 128, tx: 80, ty: 1, vx: 0, vy: -6, spd: 6, born: 0, dodge: 0 }; g.foes.push(f);
  g.blasts.push({ id: 78, x: 72, y: 66, kind: 'abm', r: 5, rMax: 7.4, tg: 0.5, th: 5, ts: 0.6, t: 0.5, chain: 0 });
  run(g, 0.5); assert(f.x > 81, 'smart x=' + f.x); assert(f.dodge >= 0);
});
test('EMP: limited charges, wipes a big area, earns points', () => {
  const g = S.createGame({ seed: 2, startWave: 3 }); toPlay(g); assert.strictEqual(g.emp, 2);
  for (let i = 0; i < 6; i++) g.foes.push({ id: 500 + i, kind: 'icbm', x: 60 + i * 8, y: 80, x0: 0, y0: 128, tx: 80, ty: 1, vx: 0, vy: -0.001, spd: 0.001, born: 0, dodge: 0 });
  let once = true; const evs = run(g, 1.2, () => { const e = once; once = false; return { cx: 80, cy: 80, emp: e }; });
  assert(evs.some(e => e.e === 'emp')); assert(g.emp <= 1);
  assert(evs.filter(e => e.e === 'kill' && e.id >= 500 && e.id < 506).length === 6);
  g.emp = 0; S.step(g, { emp: true }); assert(!g.events.some(e => e.e === 'emp'));
});
test('impact destroys a city; end-of-wave tally counts ammo and cities', () => {
  const g = S.createGame({ seed: 6 }); toPlay(g); g.sched.list.length = 0; g.foes.length = 0;
  g.foes.push({ id: 600, kind: 'icbm', x: 30, y: 4, x0: 30, y0: 128, tx: 30, ty: 1.2, vx: 0, vy: -20, spd: 20, born: 0, dodge: 0 });
  const evs = run(g, 12); assert(evs.some(e => e.e === 'city' && e.i === 0)); assert(!g.cities[0].alive);
  const t = evs.find(e => e.e === 'tally'); assert(t && t.ammo === 30 && t.cities === 5);
  const tick = evs.filter(e => e.e === 'tick'); assert(tick.length >= 35);
  assert(evs.some(e => e.e === 'waveclear')); assert.strictEqual(g.wave, 2);
  assert.strictEqual(g.score, 30 * 5 + 5 * 100);
});
test('bonus city every 10,000 points rebuilds a fallen city next wave', () => {
  const g = S.createGame({ seed: 6 }); toPlay(g); g.cities[2].alive = false;
  S.addScore(g, 9990); assert.strictEqual(g.reserve, 0); S.addScore(g, 20); assert.strictEqual(g.reserve, 1); S.addScore(g, 20000); assert.strictEqual(g.reserve, 3);
  g.sched.list.length = 0; g.foes.length = 0; const evs = run(g, 14);
  assert(evs.some(e => e.e === 'cityback' && e.i === 2)); assert(g.cities[2].alive); assert.strictEqual(g.reserve, 2);
});
test('THE END when the last city falls with no reserve, then over', () => {
  const g = S.createGame({ seed: 7 }); toPlay(g); g.sched.list.length = 0; g.foes.length = 0; g.cities.forEach(c => c.alive = false);
  const evs = run(g, 20); assert(evs.some(e => e.e === 'end')); assert(evs.some(e => e.e === 'over')); assert(g.ended && g.over); assert.strictEqual(g.survived, 0);
  assert.deepStrictEqual(Object.keys(S.status(g)).sort(), ['a', 'c', 'e', 'r', 's', 'w']);
});
test('counterattacks arrive as extra warheads from a separate rng', () => {
  const g = S.createGame({ seed: 7, startWave: 2 }); toPlay(g); const list = JSON.stringify(g.sched.list);
  S.addAttack(g, 3); const evs = run(g, 3); assert.strictEqual(evs.filter(e => e.e === 'spawn' && e.kind === 'buddy').length, 3);
  assert.strictEqual(JSON.stringify(g.sched.list), list);
});
test('autopilot survives early waves (game is winnable) and is deterministic', () => {
  const play = () => { const g = S.createGame({ seed: 4242 }), A = createAuto(0.9, 11); for (let i = 0; i < 60 * 200 && g.wave < 4 && !g.ended; i++) S.step(g, A.think(g)); return g; };
  const a = play(), b = play(); assert(a.wave >= 4 || !a.ended, 'auto reached wave ' + a.wave); assert.strictEqual(a.score, b.score); assert(a.score > 1000);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
