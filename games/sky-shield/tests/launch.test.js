// Closest-silo launch + L/C/R + chain reactions: node games/sky-shield/tests/launch.test.js
const assert = require('assert');
const S = require('../js/sim.js');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); } }
const fresh = () => { const g = S.createGame({ seed: 7 }); while (g.phase !== 'play') S.step(g, null); g.foes = []; g.flyers = []; g.sched.i = g.sched.list.length; return g; };
const launchBase = (g, cx, cy, which) => { S.step(g, { cx, cy, fire: [which] }); const l = g.events.find(e => e.e === 'launch'); return l ? l.base : (g.events.some(e => e.e === 'dry') ? 'dry' : null); };

test('closest mode (-2): fires the silo nearest the aim point', () => {
  assert.strictEqual(launchBase(fresh(), 20, 60, -2), 0);
  assert.strictEqual(launchBase(fresh(), 82, 60, -2), 1);
  assert.strictEqual(launchBase(fresh(), 150, 60, -2), 2);
});
test('closest empty -> next closest; destroyed -> next closest', () => {
  let g = fresh(); g.bases[0].ammo = 0; assert.strictEqual(launchBase(g, 20, 60, -2), 1);
  g = fresh(); g.bases[0].alive = false; g.bases[0].ammo = 0; assert.strictEqual(launchBase(g, 20, 60, -2), 1);
  g = fresh(); g.bases[0].ammo = 0; g.bases[1].alive = false; assert.strictEqual(launchBase(g, 20, 60, -2), 2);
  g = fresh(); g.bases[2].ammo = 0; assert.strictEqual(launchBase(g, 150, 60, -2), 1);
  assert.deepStrictEqual(S.closestOrder(fresh(), 30, 60), [0, 1, 2]);
});
test('no silo available -> no launch, dry sound event', () => {
  const g = fresh(); g.bases.forEach(b => b.ammo = 0); assert.strictEqual(launchBase(g, 80, 60, -2), 'dry'); assert.strictEqual(g.abms.length, 0);
  assert.strictEqual(S.closestBase(g, 80, 60), -1);
});
test('L/C/R (0/1/2) still fire their own silo regardless of aim; best (-1) unchanged', () => {
  for (const [x, i] of [[150, 0], [10, 1], [10, 2]]) assert.strictEqual(launchBase(fresh(), x, 60, i), i);
  let g = fresh(); g.bases[0].ammo = 0; assert.strictEqual(launchBase(g, 20, 60, 0), 'dry'); // own silo only, no fallback
  const g2 = fresh(); assert.strictEqual(launchBase(g2, 20, 60, -1), S.bestBase(fresh(), 20, 60));
});
test('chain reaction: blast kills a warhead whose secondary blast catches the next, with escalating multiplier', () => {
  const g = fresh();
  const mk = (id, x) => ({ id, kind: 'icbm', x, y: 60, x0: x, y0: 120, tx: x, ty: 0, vx: 0, vy: -0.0001, spd: 0.0001, born: 0 });
  g.foes = [mk(901, 80), mk(902, 85.5), mk(903, 91), mk(904, 96.5)];
  g.blasts.push({ id: 900, x: 80, y: 60, kind: 'abm', r: 2, rMax: 9, tg: 0.5, th: 0.3, ts: 0.6, t: 0.1, chain: 1, gen: 0 }); g.chains[1] = { n: 0, noAtk: true, sent: 0 }; g.chainId = 1;
  const evs = []; for (let i = 0; i < 120; i++) { S.step(g, null); evs.push(...g.events); }
  const kills = evs.filter(e => e.e === 'kill'); assert.strictEqual(kills.length, 4, 'all 4 chained');
  const pops = evs.filter(e => e.e === 'chainpop'); assert(pops.length >= 3); assert(pops[pops.length - 1].mult >= 2);
  assert(evs.filter(e => e.e === 'blast' && e.kind === 'foe').length === 4);
});
test('chain generation cap stops runaway secondary blasts', () => {
  assert(S.CHAIN_GEN_MAX >= 5 && S.chainMult(1) === 1 && S.chainMult(9) === 5 && S.chainMult(100) === 5);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
