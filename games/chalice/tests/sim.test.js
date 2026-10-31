/* Chalice: deterministic rules checks + bot playtests proving every level is winnable.
   Run:  node games/chalice/tests/sim.test.js            (env: SEEDS=8) */
const World = require('../js/world.js'), Sim = require('../js/sim.js'), Bot = require('../js/bot.js');
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
const idle = { mx: 0, my: 0, drop: false, flare: false };
const run = (S, inp, n) => { let ev = []; for (let i = 0; i < n; i++) ev = ev.concat(S.step(inp)); return ev; };
const place = (S, room, lx, ly) => { const r = S.w.rooms[room]; S.player.x = r.x0 + lx; S.player.y = r.y0 + ly; S.player.vx = S.player.vy = 0; };

console.log('== WORLD');
for (const lv of [1, 2, 3, 4]) {
  const w = World.build(lv, 5); const ids = Object.keys(w.rooms);
  check(ids.includes('gold_castle') && ids.includes('gold_inner'), `L${lv} "${World.LEVELS[lv].name}": ${ids.length} rooms incl. the gold castle and its hall`);
}
const w4 = World.build(4, 1);
check(['gold', 'black', 'white', 'jade'].every(k => w4.gates.some(g => g.key === k)) && w4.pedestals.length === 3, 'L4 has gold/white/black castles + the Jade castle with 3 key pedestals');
check(Object.values(World.build(2, 1).rooms).some(r => r.kind === 'catacomb') && Object.values(World.build(2, 1).rooms).some(r => r.kind === 'maze'), 'L2 has the blue labyrinth and dark catacombs');

console.log('== RULES');
{ const S = Sim.create({ level: 1, seed: 1 });
  check(S.dragons.length >= 2 && S.bat == null || S.dragons.length >= 2, 'L1 has dragons', S.dragons.map(d => d.name));
  const S2 = Sim.create({ level: 2, seed: 1 });
  check(S2.dragons.length === 3 && !!S2.bat, 'L2: yellow, green and red dragons and the bat', S2.dragons.map(d => d.id));
  check(['sword', 'magnet', 'bridge', 'chalice', 'gold', 'white', 'black'].every(id => S2.item(id)), 'L2 items: sword, magnet, bridge, chalice and three keys');
  check(S2.time === 0 && (run(S2, idle, 30), S2.time === 0), 'timer waits for the first input');
  run(S2, { mx: 1, my: 0 }, 2); check(S2.time > 0, 'timer starts on first input');
}
{ // carry one item at a time: picking up a second swaps
  const S = Sim.create({ level: 2, seed: 1 }); S.dragons.forEach(d => { d.alive = false; }); if (S.bat) S.bat.x = -999;
  const sw = S.item('sword'), mg = S.item('magnet');
  place(S, 'kingsroad', 10, 6); sw.holder = null; sw.x = S.player.x + 0.6; sw.y = S.player.y; mg.holder = null; mg.x = S.player.x + 3; mg.y = S.player.y;
  const e1 = run(S, { mx: 1, my: 0 }, 20);
  check(S.player.held === sw && e1.some(e => e.type === 'pick'), 'walking into the sword picks it up');
  run(S, { mx: 1, my: 0 }, 50); check(S.player.held === sw, 'with full hands, walking past the magnet does not grab it');
  mg.x = S.player.x + 0.2; mg.y = S.player.y + 0.3; S.step({ mx: 0, my: 0, drop: true });
  check(S.player.held === mg && !sw.holder, 'SPACE while touching the magnet swaps it for the sword: one item at a time', S.player.held && S.player.held.id);
  run(S, { mx: 0, my: 1 }, 40); const e2 = run(S, { mx: 0, my: 0, drop: true }, 1); check(!S.player.held && e2.some(e => e.type === 'drop'), 'SPACE drops the carried item');
}
{ // a key opens its castle gate
  const S = Sim.create({ level: 2, seed: 1 }); S.dragons.forEach(d => { d.alive = false; }); if (S.bat) S.bat.x = -999;
  const g = S.w.gates.find(q => q.key === 'gold'); const k = S.item('gold');
  check(!g.open, 'gold castle gate starts closed');
  place(S, 'gold_castle', 9.5, 8.5); k.holder = 'player'; S.player.held = k;
  const ev = run(S, { mx: 0, my: -1 }, 120);
  check(g.open && ev.some(e => e.type === 'gate'), 'touching the gate with the gold key raises it');
}
{ // the sword slays a dragon
  const S = Sim.create({ level: 2, seed: 2 }); if (S.bat) S.bat.x = -999; const d = S.dragons[0]; const sw = S.item('sword');
  place(S, 'kingsroad', 6, 6); S.player.held = sw; sw.holder = 'player'; S.player.fx = 1; S.player.fy = 0;
  S.dragons.forEach(o => { if (o !== d) o.alive = false; }); d.x = S.player.x + 3; d.y = S.player.y; d.state = 'chase';
  let ev = []; for (let i = 0; i < 400 && d.alive && !S.player.dead; i++) ev = ev.concat(S.step({ mx: 1, my: 0 }));
  check(!d.alive && ev.some(e => e.type === 'slay'), 'charging with the sword slays ' + d.name);
}
{ // without the sword, a dragon eats you; SPACE rises again
  const S = Sim.create({ level: 2, seed: 3 }); if (S.bat) S.bat.x = -999; const d = S.dragons[2];
  place(S, 'kingsroad', 6, 6); S.dragons.forEach(o => { if (o !== d) o.alive = false; }); d.x = S.player.x + 1.5; d.y = S.player.y; d.state = 'chase';
  S.step({ mx: 1, my: 0 }); let ev = []; for (let i = 0; i < 600 && !S.player.dead; i++) ev = ev.concat(S.step(idle));
  check(S.player.dead && ev.some(e => e.type === 'eaten'), d.name + ' eats an unarmed knight');
  run(S, idle, 90); run(S, { mx: 0, my: 0, drop: true }, 1); run(S, idle, 5);
  check(!S.player.dead && S.roomOf(S.player.x, S.player.y).id.startsWith('gold'), 'SPACE rises again at the gold castle');
}
{ // the bat steals what you carry
  const S = Sim.create({ level: 2, seed: 4 }); S.dragons.forEach(d => { d.alive = false; }); const B = S.bat; const sw = S.item('sword');
  place(S, 'kingsroad', 10, 6); S.player.held = sw; sw.holder = 'player'; if (B.held) { B.held.holder = null; B.held = null; } B.x = S.player.x + 4; B.y = S.player.y - 1; B.sated = 0; B.cool = 0; B.state = 'seek'; B.target = sw; B.t = 22;
  let ev = []; for (let i = 0; i < 60 * 30 && S.player.held === sw; i++) ev = ev.concat(S.step(idle));
  check(S.player.held !== sw && ev.some(e => e.type === 'steal' || e.type === 'snatch' || e.type === 'batgrab'), 'the bat snatches the sword from the knight', ev.filter(e => /bat|steal|snatch/.test(e.type)).map(e => e.type).slice(0, 4));
}
{ // the chalice in the gold hall wins
  const S = Sim.create({ level: 1, seed: 1 }); const c = S.item('chalice'); S.dragons.forEach(d => { d.alive = false; });
  S.w.gates.forEach(g => { g.open = true; g.t = 1; });
  place(S, 'gold_inner', 10, 8); S.player.held = c; c.holder = 'player'; const ev = run(S, { mx: 0, my: -1 }, 120);
  check(S.won && ev.some(e => e.type === 'win'), 'carrying the Chalice into the Gold Throne Hall wins');
}

console.log('== BOT PLAYTESTS');
const SEEDS = +(process.env.SEEDS || 8);
for (const lv of [1, 2, 3, 4]) for (const d of ['BB', 'AA']) {
  const ts = []; let lost = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const S = Sim.create({ level: lv, seed, diffL: d[0], diffR: d[1] }); const B = Bot.create(S); let n = 0;
    while (!S.won && n < 60 * 900) { S.step(B.think()); n++; }
    if (S.won) ts.push(S.time); else lost.push(seed);
  }
  ts.sort((a, b) => a - b);
  check(lost.length === 0, `L${lv} switches ${d}: bot wins ${ts.length}/${SEEDS} (median ${(ts[ts.length >> 1] || 0).toFixed(0)}s, max ${(ts[ts.length - 1] || 0).toFixed(0)}s)`, lost.length ? { lost } : undefined);
}
{ const a = Sim.create({ level: 3, seed: 11 }), b = Sim.create({ level: 3, seed: 12 });
  check(['chalice', 'sword', 'gold'].some(id => a.item(id).x !== b.item(id).x || a.item(id).y !== b.item(id).y), 'L3 shuffles item placement per game'); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
