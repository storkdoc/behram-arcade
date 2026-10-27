/* TANK DUEL spawn-kill tests:  node games/tank-duel/tests/respawn.test.js
   A "camper" aimbot (instant perfect aim, fires whenever it has a straight line) against an idle victim, in every
   variation. With the old in-place recovery the camper re-kills within about 0.7 s, so kills chain. With respawn + spawn
   protection, no kill can land within SPAWN_PROT of a respawn, and respawn points must be fair. */
const S = require('../js/sim.js'); global.TDSim = S; const AI = require('../js/ai.js');
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
const idle = () => ({ turn: 0, thrust: 0, fire: false, fireN: 0, specN: 0 });
function toPlay(g) { let n = 0; while (g.phase === 'countdown' && n++ < 400) S.step(g, [idle(), idle()]); }
// camper/chaser: perfect instant aim, fires whenever it has a straight line, and drives at the victim when it is far
const camper = (g, n) => { const k = g.tanks[0], v = g.tanks[1]; if (k.spin <= 0) k.a = Math.atan2(v.y - k.y, v.x - k.x);
  const see = S.los(g, k.x, k.y, v.x, v.y), d = Math.hypot(v.x - k.x, v.y - k.y); return { ...idle(), thrust: see && d > 4 ? 1 : 0, fire: see, fireN: n }; };
function duel(vIdx, legacy, secs = 40, victimAI = null) {
  const g = S.createGame({ variant: vIdx, seed: 77 + vIdx, round: 's15', legacySpawn: legacy }); toPlay(g);
  // start like a fresh kill at close range: the camper is right next to where the victim goes down
  { const k = g.tanks[0], v = g.tanks[1]; let best = null;
    for (let y = 1.5; y < S.H - 1; y++) for (let x = 1.5; x < S.W - 1; x++) for (let dx = 2; dx <= 4; dx++) {
      const ok = (px, py) => !S.solidAt(g, px, py) && !S.solidAt(g, px + .5, py) && !S.solidAt(g, px - .5, py) && !S.solidAt(g, px, py + .5) && !S.solidAt(g, px, py - .5) && !S.moverAt(g, px, py, 1) && !g.mines.some(m => Math.hypot(m.x - px, m.y - py) < 1.5);
      if (!best && ok(x, y) && ok(x + dx, y) && S.los(g, x, y, x + dx, y) && Math.abs(x - S.W / 2) < 8) best = [x, y, dx];
    }
    if (best) { k.x = best[0]; k.y = best[1]; v.x = best[0] + best[2]; v.y = best[1]; k.a = 0; }
    S.hitTank(g, v, 0, v.x - 0.4, v.y, 10, 0, 'shell'); }
  const out = { kills: 0, gaps: [], badSpawns: [], nudges: 0, fireDuringCease: 0, protKills: 0, spawnD: [], spawnLOS: 0, spawns: 0, protEndedByFire: 0 };
  let lastBack = g.t, lastHit = -9;
  for (let i = 0; i < secs * 60 && g.phase === 'play'; i++) {
    const i1 = victimAI ? victimAI.think(g) : idle();
    S.step(g, [camper(g, i + 1), i1]);
    for (const e of g.events) {
      if (e.e === 'hit' && e.tank === 1) { out.kills++; out.gaps.push(+(g.t - lastBack).toFixed(2)); lastHit = g.t; }
      if (e.e === 'fire' && g.t - lastHit > 0.001 && g.t - lastHit < 0.74 && !legacy) out.fireDuringCease++;
      if (e.e === 'nudge') out.nudges++;
      if (e.e === 'respawn' && e.tank === 1) {
        lastBack = g.t; out.spawns++; const k = g.tanks[0], v = g.tanks[1];
        out.spawnD.push(Math.hypot(v.x - k.x, v.y - k.y)); if (S.los(g, k.x, k.y, v.x, v.y)) out.spawnLOS++;
        const r = S.TANK_R; let fits = !S.solidAt(g, v.x, v.y); for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; if (S.solidAt(g, v.x + Math.cos(a) * r, v.y + Math.sin(a) * r)) fits = false; }
        if (!fits || S.moverAt(g, v.x, v.y, 0.3) || g.mines.some(m => Math.hypot(m.x - v.x, m.y - v.y) < 1) || g.portals.some(p => Math.hypot(p.x - v.x, p.y - v.y) < 1)) out.badSpawns.push([v.x, v.y]);
      }
    }
    // legacy: "back in action" when spin ends
    if (legacy && g.tanks[1].spin <= 0 && g.tanks[1].inv > 0.68) lastBack = g.t;
  }
  out.minGap = out.gaps.length ? Math.min(...out.gaps) : null;
  return out;
}
// 1. the old behaviour chains kills (demonstrates the bug the user reported)
{ const o = duel(S.VARIANTS.findIndex(v => v.name === 'OPEN FIELD'), true, 30);
  check(o.kills >= 12 && o.minGap < 1.0, 'OLD behaviour: camper re-kills almost instantly (kill chain)', { kills: o.kills, minGap: o.minGap }); }
// 2. every variation: no kill within the protection window, fair respawn points
let allKills = 0, legacyKills = 0;
for (let vi = 0; vi < S.VARIANTS.length; vi++) {
  const v = S.VARIANTS[vi], o = duel(vi, false), L = duel(vi, true);
  allKills += o.kills; legacyKills += L.kills;
  const avgD = o.spawnD.length ? o.spawnD.reduce((a, b) => a + b, 0) / o.spawnD.length : 0;
  const ok = (o.minGap == null || o.minGap >= S.SPAWN_PROT - 0.02) && !o.badSpawns.length && o.fireDuringCease === 0 && (o.spawns === 0 || avgD > 7);
  check(ok, `#${vi + 1} ${v.name}: no instant re-kill, safe respawns`, { kills: o.kills, legacyKills: L.kills, minGap: o.minGap, legacyMinGap: L.minGap, spawns: o.spawns, avgDist: +avgD.toFixed(1), sightAtSpawn: o.spawnLOS, bad: o.badSpawns.length, cease: o.fireDuringCease });
}
check(allKills < legacyKills * 0.6, 'overall the camper gets far fewer kills than before', { now: allKills, before: legacyKills });
// 3. respawn mechanics
{ const g = S.createGame({ variant: S.VARIANTS.findIndex(v => v.name === 'CLASSIC MAZE'), seed: 5 }); toPlay(g);
  const k = g.tanks[0], v = g.tanks[1]; k.x = 20; k.y = 10; v.x = 22; v.y = 10;
  S.hitTank(g, v, 0, 21.5, 10, 10, 0, 'shell');
  check(g.cease > 0.7, 'a kill starts a brief ceasefire', g.cease);
  let fired = 0; for (let i = 0; i < 40; i++) { S.step(g, [{ ...idle(), fire: true, fireN: i + 1 }, idle()]); fired += g.events.filter(e => e.e === 'fire').length; }
  check(fired === 0, 'no one can fire during the ceasefire');
  let resp = null; for (let i = 0; i < 80 && !resp; i++) { S.step(g, [idle(), idle()]); resp = g.events.find(e => e.e === 'respawn'); if (resp) resp.nud = g.events.some(e => e.e === 'nudge'); }
  check(resp && Math.hypot(v.x - k.x, v.y - k.y) >= 7 && v.prot > 1.9, 'victim respawns far away with spawn protection', resp && { d: Math.hypot(v.x - k.x, v.y - k.y), prot: v.prot });
  const kx0 = k.x; for (let i = 0; i < 30; i++) S.step(g, [idle(), idle()]);
  check(resp && resp.nud && k.x < kx0 - 0.8, 'the killer is nudged back toward its home side', { from: kx0, to: k.x });
  // protection: shells and mines do nothing
  const sc = k.score; v.prot = 2; S.hitTank(g, v, 0, v.x, v.y, 1, 0, 'shell'); check(k.score === sc && v.spin === 0, 'a protected tank cannot be hit');
  g.mines.push({ id: 999, owner: 0, x: v.x, y: v.y, arm: 0 }); S.step(g, [idle(), idle()]); check(g.mines.some(m => m.id === 999) && v.spin === 0, 'a protected tank does not set off mines');
  g.mines.length = 0;
  // firing ends protection
  for (let i = 0; i < 5; i++) S.step(g, [idle(), { ...idle(), fire: true, fireN: 1 }]);
  check(v.prot === 0, 'firing ends spawn protection early', v.prot);
}
// 4. the CPU does not waste shots on (or camp) a protected tank
{ let shotsAtProt = 0, kills = 0, protKills = 0;
  for (const vi of [0, 1, 2, 4, 7, 12, 18, 21, 22, 23]) {
    const g = S.createGame({ variant: vi, seed: 900 + vi, round: 's15' }); toPlay(g);
    const ais = [AI.createAI(0, 3, 11 + vi), AI.createAI(1, 3, 22 + vi)];
    for (let i = 0; i < 60 * 60 && g.phase === 'play'; i++) {
      const pre = g.tanks.map(t => t.prot);
      S.step(g, [ais[0].think(g), ais[1].think(g)]);
      for (const e of g.events) { if (e.e === 'fire' && pre[1 - e.tank] > 0.2) shotsAtProt++; if (e.e === 'hit') { kills++; if (pre[e.tank] > 0) protKills++; } }
    }
  }
  check(protKills === 0, 'ACE vs ACE: no kill ever lands on a protected tank', { kills, protKills });
  check(shotsAtProt <= 3, 'ACE does not fire at a protected tank', shotsAtProt);
}
// 5. 1P vs CPU: an ACE CPU against a player who just sits there, in every variation. Kill-to-kill time must leave the player a real chance.
{ let minGap = 99, kills = 0, worst = '';
  for (let vi = 0; vi < S.VARIANTS.length; vi++) {
    const g = S.createGame({ variant: vi, seed: 300 + vi, round: 's15' }); toPlay(g); const ai = AI.createAI(0, 3, 5 + vi);
    let back = null;
    for (let i = 0; i < 90 * 60 && g.phase === 'play'; i++) { S.step(g, [ai.think(g), idle()]);
      for (const e of g.events) { if (e.e === 'respawn' && e.tank === 1) back = g.t; if (e.e === 'hit' && e.tank === 1) { kills++; if (back != null && g.t - back < minGap) { minGap = g.t - back; worst = S.VARIANTS[vi].name; } } } }
  }
  check(minGap >= S.SPAWN_PROT, 'ACE CPU vs a sitting player: never re-kills inside the shield window', { kills, minGapAfterRespawn: +minGap.toFixed(2), worst });
}
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
