/* Rock-paper-scissors check: equal-resource armies fight in open ground.  node games/age-of-embers/tests/counters.js */
for (const f of ['util', 'data', 'map', 'path', 'sim', 'ai']) require('../js/' + f + '.js');
const E = global.EMB;
const cost = t => Object.values(E.D.UNITS[t].cost).reduce((a, b) => a + b, 0);
function fight(a, b, budget) {
  const G = new E.Game({ seed: 3, mapType: 'heartland', size: 64, players: [{ name: 'A' }, { name: 'B' }] });
  for (const u of G.units.slice()) G.ents.delete(u.id);
  G.units.length = 0; for (const b of G.blds) G.ents.delete(b.id); G.blds.length = 0;
  const cx = 32, cy = 32;
  const na = Math.round(budget / cost(a)), nb = Math.round(budget / cost(b));
  const A = [], B = [];
  for (let i = 0; i < na; i++) A.push(G.spawnUnit(a, 0, cx - 3 + (i % 3) * 0.7, cy - 2 + Math.floor(i / 3) * 0.7).id);
  for (let i = 0; i < nb; i++) B.push(G.spawnUnit(b, 1, cx + 3 + (i % 3) * 0.7, cy - 2 + Math.floor(i / 3) * 0.7).id);
  for (let t = 0; t < 120 * 20; t++) {
    if (t % 20 === 0) {
      const ea = G.units.filter(u => u.owner === 1), eb = G.units.filter(u => u.owner === 0);
      if (!ea.length || !eb.length) break;
      for (const u of eb) if (u.st !== 'attack') G.cmdAttack([u.id], ea[0].id);
      for (const u of ea) if (u.st !== 'attack') G.cmdAttack([u.id], eb[0].id);
    }
    G.step();
  }
  const la = G.units.filter(u => u.owner === 0).length, lb = G.units.filter(u => u.owner === 1).length;
  return { a, b, na, nb, la, lb, win: la > lb ? a : b };
}
let pass = 0, fail = 0;
for (const [w, l] of [['spear', 'knight'], ['spear', 'scout'], ['knight', 'archer'], ['archer', 'infantry'], ['infantry', 'spear']]) {
  const r = fight(w, l, 900);
  const ok = r.win === w; ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${w} x${r.na} vs ${l} x${r.nb} -> survivors ${r.la}:${r.lb}`);
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
