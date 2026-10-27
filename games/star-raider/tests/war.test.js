// Headless WAR playtest: two strategist bots fight full matches. Checks balance, win conditions and fog privacy.
// node tests/war.test.js [N]
const S = require('../js/sim.js'); global.SRSim = S; const A = require('../js/auto.js');
const N = +process.argv[2] || 6; let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fails++; };
function play(o, styles, skills) {
  const G = S.newGame(Object.assign({ mode: 'war' }, o)); S.addPlayer(G, 0); S.addPlayer(G, 1);
  const bots = [A.makeWar(skills[0], styles[0]), A.makeWar(skills[1], styles[1])];
  const dt = 1 / 20, acts = [0, 0], meets = { n: 0 }, leaks = [];
  let duel = 0;
  while (!G.over && G.t < 1500) {
    const inp = [bots[0](G, G.players[0], dt), bots[1](G, G.players[1], dt)];
    inp.forEach((i, k) => acts[k] += (i.acts || []).length);
    S.stepWorld(G, inp, dt);
    const [a, b] = G.players;
    if (a.alive && b.alive && !a.inTransit && !b.inTransit && a.sx === b.sx && a.sy === b.sy) duel += dt;
    if (Math.round(G.t * 20) % 200 === 0) {
      // privacy: side 1's view must not contain hidden side-0 data
      const v = S.viewFor(G, 1), js = JSON.stringify(v), vis = new Set(v.vis);
      for (const f of v.fleets) if (!f.own && ('decoy' in f || 'd' in f || 'name' in f)) leaks.push('enemy detail');
      for (const f of v.fleets) if (!f.own && f.order) leaks.push('enemy order');
      if ('res' in v && v.res !== Math.floor(G.war.res[1])) leaks.push('res');
      for (const m of G.war.mines) if (m.team === 0 && v.mines.some(x => x.x === m.x && x.y === m.y)) leaks.push('mine');
      if (v.foe && !vis.has(S.key(a.sx, a.sy))) leaks.push('foe pos');
      for (const f of v.fleets) if (!f.own && f.live && !G.fleets.some(g => g.id === f.id && g.team === 0)) leaks.push('ghost live');
    }
  }
  return { G, acts, duel, leaks };
}
const rows = {}, wins = {};
for (const [name, o, styles, skills] of [
  ['classic short, equal', { layout: 'classic', length: 'short' }, ['balanced', 'balanced'], [1, 1]],
  ['crossfire short, rush vs balanced', { layout: 'crossfire', length: 'short' }, ['rush', 'balanced'], [1, 1]],
  ['nebula long, equal', { layout: 'nebula', length: 'long' }, ['balanced', 'hunter'], [1, 1]],
  ['classic short, sharp vs sloppy', { layout: 'classic', length: 'short' }, ['balanced', 'balanced'], [1, 0.3]],
]) {
  const res = []; for (let i = 0; i < N; i++) res.push(play(Object.assign({ seed: 100 + i * 7 }, o), styles, skills));
  const w0 = res.filter(r => r.G.over && r.G.over.winner === 0).length;
  rows[name] = { win0: w0 + '/' + N, min: (res.reduce((a, r) => a + r.G.t, 0) / N / 60).toFixed(1), duel_s: (res.reduce((a, r) => a + r.duel, 0) / N).toFixed(0),
    acts: (res.reduce((a, r) => a + r.acts[0] + r.acts[1], 0) / N).toFixed(0), basesK: (res.reduce((a, r) => a + r.G.war.score[0].bases + r.G.war.score[1].bases, 0) / N).toFixed(1),
    flagK: (res.reduce((a, r) => a + r.G.war.score[0].flag + r.G.war.score[1].flag, 0) / N).toFixed(1), ends: [...new Set(res.map(r => r.G.over ? r.G.over.why.replace(/\d+/g, 'n') : 'NONE'))].join('|').slice(0, 70) };
  wins[name] = w0;
  ok(res.every(r => r.G.over), name + ': every match ends');
  ok(res.every(r => !r.leaks.length), name + ': no fog leaks ' + [...new Set(res.flatMap(r => r.leaks))].join(','));
}
console.table(rows);
ok(wins['classic short, sharp vs sloppy'] >= N * 0.6, 'the better commander usually wins');
ok(wins['classic short, equal'] > 0 && wins['classic short, equal'] < N, 'equal bots split classic games');
process.exit(fails ? 1 : 0);
