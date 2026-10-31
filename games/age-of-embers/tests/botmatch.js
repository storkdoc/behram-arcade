/* Headless CPU-vs-CPU matches for balance and pacing.  node games/age-of-embers/tests/botmatch.js [levelA] [levelB] [seed] [map] [minutes] */
for (const f of ['util', 'data', 'map', 'path', 'sim', 'ai']) require('../js/' + f + '.js');
const E = global.EMB;
function match(la, lb, seed, map, minutes, verbose) {
  const G = new E.Game({ seed, mapType: map || 'heartland', size: 96, players: [{ name: 'A', ai: la }, { name: 'B', ai: lb }] });
  G.ais.push(new E.AI(G, 0, la), new E.AI(G, 1, lb));
  const t0 = Date.now(); let lastMin = -1;
  while (!G.over && G.time < minutes * 60) {
    G.step();
    const m = Math.floor(G.time / 60);
    if (verbose && m !== lastMin && m % 2 === 0) { lastMin = m; console.log(`t=${m}m`, G.players.map(p => `${p.name}: age${p.age} pop${p.pop}/${p.popCap} vil${G.units.filter(u => u.owner === p.id && u.type === 'villager').length} army${G.armyOf(p.id)} b${G.blds.filter(b => b.owner === p.id).length} res ${Object.values(p.res).map(Math.round).join('/')} k${p.stats.kills}`).join(' | '), 'units', G.units.length); }
  }
  return { winner: G.winner, how: G.winHow, min: +(G.time / 60).toFixed(1), ms: Date.now() - t0, ages: G.players.map(p => p.stats.ageT.map(t => t < 0 ? '-' : (t / 60).toFixed(1)).join(',')), score: G.players.map(p => G.score(p)), G };
}
module.exports = match;
if (require.main === module) {
  const a = process.argv.slice(2); const r = match(+(a[0] || 1), +(a[1] || 1), +(a[2] || 7), a[3], +(a[4] || 40), true);
  console.log(JSON.stringify(Object.assign({}, r, { G: undefined })));
}
