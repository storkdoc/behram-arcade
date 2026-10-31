/* AGE OF EMBERS — "The First Flame": a guided campaign of six short scenarios that teach the game
   step by step (gather -> build -> age up -> defend -> conquer -> wonder). */
(function (E) {
  'use strict';
  const D = E.D;
  const C = E.Campaign = {};
  const vils = (G, o) => G.units.filter(u => u.owner === o && u.type === 'villager').length;
  const mil = (G, o) => G.units.filter(u => u.owner === o && E.Game.isMil(u.type)).length;
  const has = (G, o, t, n) => G.count(o, t) >= (n || 1);
  // give player o a finished town around its start
  function town(G, o, list) {
    const p = G.players[o], sx = Math.floor(p.startX), sy = Math.floor(p.startY);
    for (const [type, dx, dy] of list) { const tx = sx + dx, ty = sy + dy; if (!G.placeBlock(o, type, tx, ty, true)) G.placeBuilding(type, o, tx, ty, true); }
  }
  function addVils(G, o, n) { const p = G.players[o]; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; G.spawnUnit('villager', o, p.startX + Math.cos(a) * 3.2, p.startY + Math.sin(a) * 3.2); } }
  function age(G, o, a) { for (let k = 1; k <= a; k++) G._researched(o, 'age' + k); }
  C.list = [
    {
      id: 'kindling', name: 'Kindling', sub: 'Mission 1 · Gathering',
      brief: 'Your tribe has found a quiet valley. Every great age begins with a single fire. Put your villagers to work: chop wood, gather berries and grow your people.',
      opts: { seed: 4101, mapType: 'heartland', size: 64, noConquest: true, noDefeat: true, players: [{ name: 'You' }, { name: 'Wilds', ai: 0, passive: true }], allowBuild: ['house'], allowTrain: ['villager'], allowTech: [] },
      setup(G) { const p = G.players[1]; for (const u of G.units.filter(u => u.owner === 1)) G.killUnit(u); for (const b of G.blds.filter(b => b.owner === 1)) G.removeBuilding(b, true); p.alive = false; },
      goals: [
        { text: 'Select a villager (click or tap it — Space jumps to an idle one).', done: (G, S) => S.selVil },
        { text: 'Right-click / tap a tree to chop it. Gather 100 wood.', done: G => G.players[0].stats.gathered.w >= 100 },
        { text: 'Send a villager to the berry bushes. Gather 100 food.', done: G => G.players[0].stats.gathered.f >= 100 },
        { text: 'Select your Town Center and train 3 more villagers.', done: G => vils(G, 0) >= 6 },
        { text: 'Build a House (villager → Build → House) to raise your population cap.', done: G => has(G, 0, 'house') }
      ]
    },
    {
      id: 'hearth', name: 'Hearth and Home', sub: 'Mission 2 · Building an economy',
      brief: 'A village needs more than huts. Build camps beside the forest and the mines, a mill for your fields, and grow to fifteen people.',
      opts: { seed: 5207, mapType: 'heartland', size: 72, noConquest: true, noDefeat: true, players: [{ name: 'You' }, { name: 'Wilds', passive: true }], startRes: { f: 300, w: 400, g: 100, s: 100 }, allowBuild: ['house', 'lumbercamp', 'miningcamp', 'mill', 'farm'], allowTrain: ['villager'], allowTech: ['loom'] },
      setup(G) { const p = G.players[1]; for (const u of G.units.filter(u => u.owner === 1)) G.killUnit(u); for (const b of G.blds.filter(b => b.owner === 1)) G.removeBuilding(b, true); p.alive = false; addVils(G, 0, 2); },
      goals: [
        { text: 'Build a Lumber Camp next to a forest.', done: G => has(G, 0, 'lumbercamp') },
        { text: 'Build a Mining Camp next to gold or stone.', done: G => has(G, 0, 'miningcamp') },
        { text: 'Build a Mill, then 2 Farms around it.', done: G => has(G, 0, 'mill') && has(G, 0, 'farm', 2) },
        { text: 'Gather 150 gold.', done: G => G.players[0].stats.gathered.g >= 150 },
        { text: 'Reach a population of 15.', done: G => G.players[0].pop >= 15 }
      ]
    },
    {
      id: 'bronze', name: 'Bronze Dawn', sub: 'Mission 3 · Advancing the age',
      brief: 'Neighbours are arming. Learn the secrets of bronze: build two Hearth-age buildings, store 400 food and advance. Then raise a small guard.',
      opts: { seed: 6311, mapType: 'riverlands', size: 72, noConquest: true, noDefeat: true, players: [{ name: 'You' }, { name: 'Wilds', passive: true }], startRes: { f: 350, w: 450, g: 150, s: 150 }, allowBuild: ['house', 'lumbercamp', 'miningcamp', 'mill', 'farm', 'barracks', 'archery', 'stable', 'blacksmith', 'dock', 'palisade'], allowTech: ['loom', 'age1', 'wheelbarrow', 'axe1', 'farm1', 'gold1', 'forge1', 'fletch1'] },
      setup(G) { const p = G.players[1]; for (const u of G.units.filter(u => u.owner === 1)) G.killUnit(u); for (const b of G.blds.filter(b => b.owner === 1)) G.removeBuilding(b, true); p.alive = false; addVils(G, 0, 4); town(G, 0, [['house', 3, -4], ['house', -5, 2]]); },
      goals: [
        { text: 'Build two of: Lumber Camp, Mining Camp, Mill, Barracks, Dock.', done: G => G.ageReqMet(0, 1) },
        { text: 'At the Town Center, Advance to the Bronze Age (400 food).', done: G => G.players[0].age >= 1 },
        { text: 'Build an Archery Range or a Stable.', done: G => has(G, 0, 'archery') || has(G, 0, 'stable') },
        { text: 'Raise an army of 5 soldiers.', done: G => mil(G, 0) >= 5 }
      ]
    },
    {
      id: 'raiders', name: 'Raiders at Dusk', sub: 'Mission 4 · Defence',
      brief: 'Raiders from the hills have seen your smoke. Three bands will strike. Train soldiers, use your Town Center arrows, build a tower — and keep your Town Center standing.',
      opts: { seed: 7433, mapType: 'heartland', size: 72, noConquest: true, noDefeat: true, players: [{ name: 'You' }, { name: 'Raiders', passive: true }], startRes: { f: 400, w: 500, g: 250, s: 250 }, allowTech: null },
      setup(G, S) {
        const e = G.players[1]; for (const b of G.blds.filter(b => b.owner === 1)) G.removeBuilding(b, true); for (const u of G.units.filter(u => u.owner === 1)) G.killUnit(u);
        age(G, 0, 1); addVils(G, 0, 7); town(G, 0, [['house', 3, -4], ['house', -5, 2], ['house', -4, -5], ['barracks', 4, 2], ['lumbercamp', -8, -1], ['mill', 2, 5]]);
        for (const u of G.units.filter(u => u.owner === 0 && u.type === 'villager')) u.hp = G.ustat(0, 'villager').hp;
        G.events.length = 0; S.wave = 0; S.next = 150; S.killed = 0; e.alive = true;
      },
      tick(G, S, api) {
        const e = G.players[1], p = G.players[0];
        const raiders = G.units.filter(u => u.owner === 1);
        if (S.wave < 3 && G.time >= S.next) {
          S.wave++; S.next = G.time + 140 + S.wave * 10;
          const comp = [['infantry', 4, 'scout', 2], ['infantry', 5, 'archer', 4], ['infantry', 6, 'spear', 3, 'scout', 3, 'archer', 4]][S.wave - 1];
          const a = 0.8 + S.wave * 1.7, ex = Math.max(3, Math.min(G.w - 3, p.startX + Math.cos(a) * 28)), ey = Math.max(3, Math.min(G.h - 3, p.startY + Math.sin(a) * 28));
          const fix = G._nearestPass(G.pass, ex, ey, 10) || [ex, ey]; const ids = [];
          for (let i = 0; i < comp.length; i += 2) for (let k = 0; k < comp[i + 1]; k++) ids.push(G.spawnUnit(comp[i], 1, fix[0] + (k % 3) * 0.8, fix[1] + Math.floor(k / 3) * 0.8 + i * 0.3).id);
          if (S.wave >= 3) { e.tier.infantry = 1; e.ver++; e.sc = {}; }
          G.cmdMove(ids, p.startX, p.startY, { owner: 1, attackMove: true });
          api.alert('Raiders approach from the ' + api.dirName(fix[0] - p.startX, fix[1] - p.startY) + '!', fix[0], fix[1]);
        }
        for (const u of raiders) if (u.st === 'idle') { const tc = G.blds.find(b => b.owner === 0 && b.type === 'towncenter'); if (tc) G.cmdAttack([u.id], tc.id, { owner: 1 }); }
        S.alive = G.units.filter(u => u.owner === 1).length;
      },
      goals: [
        { text: 'Prepare: train soldiers at the Barracks, build a Watch Tower.', done: (G, S) => S.wave >= 1 },
        { text: 'Defeat the first raiding band.', done: (G, S) => S.wave >= 2 || (S.wave === 1 && S.alive === 0) },
        { text: 'Defeat the second raiding band.', done: (G, S) => S.wave >= 3 || (S.wave === 2 && S.alive === 0) && G.time > 0 },
        { text: 'Defeat the final war band.', done: (G, S) => S.wave === 3 && S.alive === 0 }
      ],
      lose: G => !G.blds.some(b => b.owner === 0 && b.type === 'towncenter') ? 'Your Town Center has fallen.' : ''
    },
    {
      id: 'conquest', name: 'First Conquest', sub: 'Mission 5 · Attack',
      brief: 'The Crimson tribe across the meadow has raided you for the last time. Build an army that counters theirs and destroy every one of their key buildings.',
      opts: { seed: 8521, mapType: 'heartland', size: 80, players: [{ name: 'You' }, { name: 'Crimson Tribe', ai: 0, aiOpts: { first: 900 } }], startRes: { f: 300, w: 300, g: 200, s: 150 } },
      setup(G) { age(G, 0, 1); age(G, 1, 1); addVils(G, 0, 5); addVils(G, 1, 5); town(G, 0, [['house', 3, -4], ['house', -5, 2], ['barracks', 4, 2]]); town(G, 1, [['house', 3, -4], ['house', -5, 2], ['barracks', 4, 2]]); G.events.length = 0; },
      goals: [
        { text: 'Scout the enemy: find the Crimson Town Center.', done: G => G.blds.some(b => b.owner === 1 && b.type === 'towncenter' && G.players[0].exp[Math.floor(b.y) * G.w + Math.floor(b.x)]) || !G.players[1].alive },
        { text: 'Train an army of 10.', done: (G, S) => S.army10 || (S.army10 = mil(G, 0) >= 10) },
        { text: 'Destroy the Crimson tribe (all military and key buildings).', done: G => !G.players[1].alive }
      ]
    },
    {
      id: 'flame', name: 'The Eternal Flame', sub: 'Mission 6 · Wonder',
      brief: 'Your people stand on the edge of empire. Reach the Imperial Age and raise the Wonder of the Eternal Flame — then hold it for three minutes against a jealous rival.',
      opts: { seed: 9643, mapType: 'highlands', size: 88, players: [{ name: 'You' }, { name: 'Saffron League', ai: 1, color: 2, aiOpts: { first: 420, wonder: false } }], startRes: { f: 1200, w: 1500, g: 900, s: 800 } },
      setup(G) { for (const o of [0, 1]) { age(G, o, 2); addVils(G, o, 14); town(G, o, [['house', 3, -4], ['house', -5, 2], ['house', -4, -5], ['house', 4, 4], ['barracks', 5, 1], ['mill', 1, 6], ['lumbercamp', -8, 0], ['market', -2, -8], ['blacksmith', 6, -4]]); } G.events.length = 0; },
      goals: [
        { text: 'Advance to the Imperial Age (needs 2 of: Siege Works, Academy, Market).', done: G => G.players[0].age >= 3 },
        { text: 'Build the Wonder (800 wood, 600 gold, 600 stone).', done: G => G.blds.some(b => b.owner === 0 && b.type === 'wonder' && b.done) || (G.over && G.winner === 0) },
        { text: 'Keep the Wonder standing for 3:00 (or conquer the League).', done: G => G.over && G.winner === 0 }
      ]
    }
  ];
  C.byId = (id) => C.list.find(s => s.id === id);
  C.dirName = (dx, dy) => { const a = Math.atan2(dx + dy, dx - dy) * 180 / Math.PI; const n = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']; return n[((Math.round(a / 45) % 8) + 8) % 8]; };
  // build opts for a game; S is the persistent scenario state saved with the game
  C.makeOpts = function (sc, color) {
    const o = JSON.parse(JSON.stringify(sc.opts)); o.scenario = sc.id; o.players[0].color = color === undefined ? 0 : color;
    if (o.players[1].color === undefined) o.players[1].color = o.players[0].color === 1 ? 0 : 1;
    if (o.players[1].passive) { delete o.players[1].ai; o.players[1].human = false; }
    return o;
  };
  // per-step objective tracking (also used by the headless tutorial test)
  C.update = function (G, sc, S, api) {
    if (sc.tick) sc.tick(G, S, api);
    S.goal = S.goal || 0;
    while (S.goal < sc.goals.length && sc.goals[S.goal].done(G, S)) { S.goal++; api.goalDone(S.goal); }
    if (S.goal >= sc.goals.length && !S.won) { S.won = true; api.win(); }
    const l = sc.lose ? sc.lose(G, S) : ''; if (l && !S.lost) { S.lost = true; api.lose(l); }
  };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
