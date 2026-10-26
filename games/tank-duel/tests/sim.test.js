/* TANK DUEL headless logic tests:  node games/tank-duel/tests/sim.test.js */
const S = require('../js/sim.js'); global.TDSim = S; const AI = require('../js/ai.js');
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
const idle = () => ({ turn: 0, thrust: 0, fire: false, fireN: 0, specN: 0 });
const vi = name => S.VARIANTS.findIndex(v => v.name === name);
function toPlay(g) { let n = 0; while (g.phase === 'countdown' && n++ < 400) S.step(g, [idle(), idle()]); }
function run(g, f, frames) { const evs = []; for (let i = 0; i < frames; i++) { S.step(g, f(i)); evs.push(...g.events.map(e => Object.assign({}, e))); if (g.phase === 'over') break; } return evs; }

check(S.VARIANTS.length >= 20, 'many numbered variations', S.VARIANTS.length);
check(S.VARIANTS.every((v, i) => v.n === i + 1 && v.name && v.desc && v.tags.length), 'every variation has a number, label, description, tags');
// maps: 180° point symmetric, enclosed, both spawns free
for (const id of Object.keys(S.MAPS)) {
  const t = S.buildTiles(id); let sym = true, border = true;
  for (let y = 0; y < S.ROWS; y++) for (let x = 0; x < S.COLS; x++) { const a = t[y * S.COLS + x], b = t[(S.ROWS - 1 - y) * S.COLS + (S.COLS - 1 - x)]; if ((a > 0) !== (b > 0)) sym = false; if ((x === 0 || y === 0 || x === S.COLS - 1 || y === S.ROWS - 1) && !a) border = false; }
  const g = S.createGame({ variant: 0, seed: 1 }); g.tiles = t;
  check(sym && border && !S.solidAt(g, 2.5, 10) && !S.solidAt(g, 29.5, 10), `map ${id}: symmetric, enclosed, spawns clear`);
}
// basic hit: face each other in OPEN FIELD and fire
{ const g = S.createGame({ variant: vi('OPEN FIELD'), seed: 3 }); toPlay(g); g.tanks[1].x = 15;
  const evs = run(g, i => [{ ...idle(), fireN: 1 }, idle()], 200);
  const hit = evs.find(e => e.e === 'hit');
  check(hit && hit.tank === 1 && hit.by === 0 && g.tanks[0].score === 1, 'a direct hit scores one point for the shooter', hit && { by: hit.by, score: g.tanks.map(t => t.score) });
  check(evs.some(e => e.e === 'fire') && g.shells.length === 0, 'shell fired and consumed');
  const tk = g.tanks[1]; check(tk.x > 15.3, 'victim knocked back / spinning', { x: tk.x, spin: tk.spin, inv: tk.inv });
}
{ const g = S.createGame({ variant: vi('OPEN FIELD'), seed: 3 }); toPlay(g);
  let maxShells = 0; for (let i = 0; i < 40; i++) { S.step(g, [{ ...idle(), fireN: i + 1, fire: true }, idle()]); maxShells = Math.max(maxShells, g.shells.filter(s => s.owner === 0).length); }
  check(maxShells === 1, 'only one shell in the air at a time', maxShells);
}
{ // spinning victim is knocked back and recovers, then flickers invulnerable
  const g = S.createGame({ variant: vi('OPEN FIELD'), seed: 4 }); toPlay(g);
  S.hitTank(g, g.tanks[1], 0, 29.5, 10, 10, 0, 'shell'); const x0 = g.tanks[1].x;
  run(g, () => [idle(), idle()], 30); check(g.tanks[1].spin > 0 && g.tanks[1].x > x0 - 0.001, 'hit tank spins and is pushed along the shell path');
  run(g, () => [idle(), idle()], 70); check(g.tanks[1].spin === 0 && g.tanks[1].inv > 0, 'then recovers with a brief invulnerability');
}
{ // walls: plain shell dies on a wall; ricochet shell bounces
  const a = S.createGame({ variant: vi('OPEN FIELD'), seed: 5 }); toPlay(a); a.tanks[0].a = -Math.PI / 2;
  const ea = run(a, i => [{ ...idle(), fireN: i === 0 ? 1 : 0 }, idle()], 120); check(ea.some(e => e.e === 'thud') && !ea.some(e => e.e === 'ric'), 'no-bounce shell stops at the wall');
  const b = S.createGame({ variant: vi('RICOCHET'), seed: 5 }); toPlay(b); b.tanks[0].a = -Math.PI / 2 + 0.3;
  const eb = run(b, i => [{ ...idle(), fireN: i === 0 ? 1 : 0 }, idle()], 200); check(eb.some(e => e.e === 'ric'), 'ricochet shell bounces off a wall');
}
{ // own rebound can hit you; the point goes to the opponent
  const g = S.createGame({ variant: vi('PINBALL'), seed: 6 }); toPlay(g); const t = g.tanks[0]; t.x = 3; t.y = 10; t.a = Math.PI; // facing the left wall
  const evs = run(g, i => [{ ...idle(), fireN: i === 0 ? 1 : 0 }, idle()], 120); const h = evs.find(e => e.e === 'hit');
  check(h && h.tank === 0 && h.self && g.tanks[1].score === 1, 'own ricochet hits you and scores for the opponent', h && { self: h.self, score: g.tanks.map(t => t.score) });
}
{ // bank shot: direct hit deflects
  const g = S.createGame({ variant: vi('BANK SHOT'), seed: 7 }); toPlay(g); g.tanks[0].x = 20; g.tanks[0].y = 10; g.tanks[1].x = 24; g.tanks[1].y = 10;
  const evs = run(g, i => [{ ...idle(), fireN: i === 0 ? 1 : 0 }, idle()], 60);
  check(evs.some(e => e.e === 'deflect') && g.tanks[0].score === 0, 'bank-shot mode: direct hits glance off');
}
{ // guided: turning steers the shell
  const g = S.createGame({ variant: vi('GUIDED · OPEN FIELD'), seed: 8 }); toPlay(g); g.tanks[0].y = 6;
  S.step(g, [{ ...idle(), fireN: 1 }, idle()]); const a0 = g.shells[0].a; for (let i = 0; i < 20; i++) S.step(g, [{ ...idle(), fireN: 1, turn: 1 }, idle()]);
  check(g.shells.length && Math.abs(S.wrapA(g.shells[0].a - a0)) > 0.5, 'guided missile turns with the stick', g.shells[0] && g.shells[0].a);
}
{ // invisible tanks
  const g = S.createGame({ variant: vi('INVISIBLE TANKS'), seed: 9 }); toPlay(g); run(g, () => [idle(), idle()], 120);
  check(!S.isVisible(g, g.tanks[0]), 'invisible tank is hidden while quiet');
  S.step(g, [{ ...idle(), fireN: 1 }, idle()]); check(S.isVisible(g, g.tanks[0]), 'and shows up when it fires');
}
{ // destructible bricks
  const g = S.createGame({ variant: vi('DEMOLITION'), seed: 10 }); toPlay(g);
  const before = g.tiles.filter(t => t === S.BRICK).length; let b = 0, fn = 0;
  const ai = [AI.createAI(0, 2, 1), AI.createAI(1, 2, 2)];
  const evs = run(g, () => [ai[0].think(g), ai[1].think(g)], 60 * 60);
  b = evs.filter(e => e.e === 'brick').length; check(before > 0 && b > 0, 'bricks take damage', { before, hits: b });
}
{ // timed round, tie -> overtime
  const g = S.createGame({ variant: vi('OPEN FIELD'), round: 't136', seed: 11 }); toPlay(g); g.tanks[0].y = 3; g.tanks[1].y = 17;
  run(g, () => [idle(), idle()], 60 * 137);
  check(g.overtime && g.phase === 'play', '2:16 round: a tie at the buzzer goes to overtime');
  S.hitTank(g, g.tanks[1], 0, g.tanks[1].x, g.tanks[1].y, 1, 0, 'shell'); check(g.phase === 'over' && g.winner === 0, 'next hit in overtime wins');
}
{ const g = S.createGame({ variant: vi('OPEN FIELD'), round: 's5', seed: 12 }); toPlay(g);
  for (let i = 0; i < 5; i++) { S.hitTank(g, g.tanks[1], 0, 29, 10, 1, 0, 'shell'); g.tanks[1].spin = 0; g.tanks[1].inv = 0; }
  check(g.phase === 'over' && g.winner === 0 && g.tanks[0].score === 5, 'first-to-5 ends at 5');
}
{ // every variation runs CPU vs CPU without errors and produces scoring
  let total = 0, bad = [];
  S.VARIANTS.forEach((v, i) => { try { const g = S.createGame({ variant: i, round: 't90', seed: 100 + i }); const ai = [AI.createAI(0, 3, i), AI.createAI(1, 1, i + 9)]; run(g, () => [ai[0].think(g), ai[1].think(g)], 60 * 60); const sc = g.tanks[0].score + g.tanks[1].score; total += sc; if (!isFinite(g.tanks[0].x) || g.tanks.some(t => S.solidAt(g, t.x, t.y))) bad.push(v.name); } catch (e) { bad.push(v.name + ': ' + e.message); } });
  check(bad.length === 0, 'all variations: 60 s CPU vs CPU, no errors, tanks never inside walls', bad);
  check(total > S.VARIANTS.length, 'CPUs actually score across variations', total);
}
{ // difficulty separates: ACE beats ROOKIE
  let ace = 0, rook = 0; for (let s = 0; s < 3; s++) { const g = S.createGame({ variant: vi('CLASSIC MAZE'), round: 't90', seed: 50 + s }); const ai = [AI.createAI(0, 3, s), AI.createAI(1, 0, s + 3)]; run(g, () => [ai[0].think(g), ai[1].think(g)], 60 * 95); ace += g.tanks[0].score; rook += g.tanks[1].score; }
  check(ace > rook, 'ACE beats ROOKIE over 3 rounds', { ace, rook });
}
{ // prediction helper: drive() moves a tank like step() does
  const a = S.createGame({ variant: 0, seed: 1 }), b = S.createGame({ variant: 0, seed: 1 }); toPlay(a); toPlay(b);
  for (let i = 0; i < 60; i++) { S.step(a, [{ ...idle(), thrust: 1, turn: 0.3 }, idle()]); S.drive(b, b.tanks[0], 0.3, 1, true); }
  check(Math.hypot(a.tanks[0].x - b.tanks[0].x, a.tanks[0].y - b.tanks[0].y) < 1e-6, 'guest prediction (drive) matches the host simulation');
}
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
