/* Headless check that every campaign mission can be completed by a scripted player
   (the same CPU brain the opponents use, driving player 0 through the public command API).
   node games/age-of-embers/tests/campaign-test.js */
for (const f of ['util', 'data', 'map', 'path', 'sim', 'ai', 'campaign']) require('../js/' + f + '.js');
const E = global.EMB, C = E.Campaign;
let pass = 0, fail = 0;
for (const sc of C.list) {
  const opts = C.makeOpts(sc, 0); const G = new E.Game(opts); const S = {}; G.scenState = S; if (sc.setup) sc.setup(G, S);
  G.players.forEach((p, i) => { if (p.ai !== null && p.ai !== undefined && p.alive) G.ais.push(new E.AI(G, i, p.ai, (opts.players[i] || {}).aiOpts)); });
  G.ais.push(new E.AI(G, 0, 3, { wonder: sc.id === 'flame' }));
  let won = false, lost = '', t0 = Date.now(); const api = { alert() { }, dirName: C.dirName, goalDone() { }, win() { won = true; }, lose(m) { lost = m; } };
  S.selVil = true; // the bot "selects" a villager
  while (!won && !lost && G.time < 45 * 60 && !(G.over && !won)) { G.step(); G.events.length = 0; C.update(G, sc, S, api); }
  const ok = won && !lost;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${sc.id}: ${won ? 'won' : lost ? 'lost (' + lost + ')' : 'timeout'} at ${(G.time / 60).toFixed(1)} min, goal ${S.goal}/${sc.goals.length} (${Date.now() - t0} ms)`);
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
