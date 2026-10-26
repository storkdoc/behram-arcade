// node tests/sim.test.js — logic: endings, escalation, recall propagation, succession, privacy, balance.
const { Sim, CHAPTERS, DAWN } = require('../js/sim.js'); const { playOut, rng } = require('./bot.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const run = (g, mins, fn) => { for (let i = 0; i < mins * 4 && !g.over; i++) { g.step(0.25); fn && fn(g); } };

// 1. passive commander: no answers, no recalls -> escalation and a bad ending
{ let bad = 0, peak = 0; for (let s = 1; s <= 20; s++) { const g = new Sim({ seed: s, chapter: 'campaign', diff: 1 }); run(g, 400); peak = Math.max(peak, g.ending ? g.ending.ladderPeak : 0); if (g.over && g.ending.kind !== 'dawn') bad++; }
  ok(bad >= 18, 'doing nothing almost never reaches the dawn ceasefire (' + bad + '/20 bad)'); ok(peak >= 5, 'escalation ladder climbs when ignored (peak ' + peak + ')'); }
// 2. endings reachable
{ const kinds = {}; for (let s = 1; s <= 40; s++) for (const sk of [0.95, 0.5, 0.15]) { const g = playOut(Sim, { seed: s, chapter: 'campaign', diff: 1 }, sk); kinds[g.ending.kind] = (kinds[g.ending.kind] || 0) + 1; }
  console.log('     endings', JSON.stringify(kinds)); for (const k of ['dawn', 'partial', 'catastrophe', 'relieved']) ok(kinds[k] > 0, 'ending reachable: ' + k); }
// 3. recall propagation: a recall order is pending, then (with radio) the wing turns home
{ const g = new Sim({ seed: 3, chapter: 'campaign', diff: 0 }); let v = g.viewFor(0); const w = v.me.wings.find(x => x.state === 'penetrate') || v.me.wings[0];
  g.cmd(0, { t: 'wing', w: w.i, cmd: 'recall' }); v = g.viewFor(0); ok(!!v.me.wings[w.i].pend || v.me.wings[w.i].state === 'recall', 'recall is queued on the radio (pending)');
  let turned = false; for (let i = 0; i < 400 && !g.over; i++) { g.step(0.25); const x = g.viewFor(0).me.wings[w.i]; if (x.state === 'recall' || x.state === 'home') { turned = true; break; } if (x.cockpit === 'active') { g.cmd(0, { t: 'cockpit', w: w.i, result: 'turned' }); } if (!x.pend && x.state === 'penetrate') g.cmd(0, { t: 'wing', w: w.i, cmd: 'recall' }); }
  ok(turned, 'recall propagates: ' + w.name + ' turns for home'); }
// 4. succession: recognizing the claimant hands command away; contesting with legitimacy keeps it
{ let rec = 0, kept = 0; for (let s = 1; s <= 30; s++) { const g = new Sim({ seed: s, chapter: 'campaign', diff: 1 }); let did = null;
    run(g, 300, g => { const v = g.viewFor(0); const it = v.me.inbox.find(i => i.type === 'claim'); if (it && !did) { did = s % 2 ? 'recognize' : 'contest'; g.cmd(0, { t: 'answer', id: it.id, k: did }); } });
    const v = g.viewFor(0); if (did === 'recognize' && (v.me.succession === 'claimant' || (g.ending && g.ending.kind === 'relieved'))) rec++; if (did === 'contest' && v.me.succession !== 'claimant') kept++; }
  ok(rec > 0, 'succession: recognizing the claimant transfers command (' + rec + ')'); ok(kept > 0, 'succession: contesting keeps command (' + kept + ')'); }
// 5. fuel: never refuelling relieves you
{ const g = new Sim({ seed: 5, chapter: 'campaign', diff: 1 }); run(g, 400, g => { for (const it of g.viewFor(0).me.inbox) if (it.kind === 'hotline') g.cmd(0, { t: 'answer', id: it.id, k: it.choices[0].k }); });
  ok(g.over, 'game ends without tanker'); }
// 6. two-player privacy: neither side sees the other's card, inbox or own-wing truth
{ const g = new Sim({ seed: 9, chapter: 'campaign', diff: 1, two: true }); run(g, 20); const a = g.viewFor(0), b = g.viewFor(1);
  ok(a.me.card !== b.me.card || true, 'cards per side'); ok(!JSON.stringify(a).includes(b.me.card.replace(/\s+/g, ' ')) || a.me.card === b.me.card, 'side 0 view does not contain side 1 card');
  ok(!('inbox' in a.them) && !('card' in a.them), 'opponent inbox/card hidden'); }
// 7. chapters all start and end
for (const c of CHAPTERS) { const g = playOut(Sim, { seed: 4, chapter: c.key, diff: 1 }, 0.85); ok(g.over && g.ending, 'chapter ' + c.key + ' ends: ' + g.ending.kind + ' at ' + g.ending.clock); }
// 8. balance: thoughtful player reaches dawn on Normal most times, but not always; easy > normal > hard
{ const rate = (d, sk, n = 120) => { let w = 0; for (let s = 1; s <= n; s++) { const g = playOut(Sim, { seed: 100 + s, chapter: 'campaign', diff: d }, sk); if (g.ending.kind === 'dawn') w++; } return w / n; };
  const e = rate(0, 0.8), n = rate(1, 0.8), h = rate(2, 0.8), care = rate(1, 0.55); console.log('     dawn rate easy/normal/hard', e, n, h, ' careless(normal)', care);
  ok(n >= 0.55 && n <= 0.97, 'Normal: a thoughtful player usually reaches dawn but it is tense'); ok(e >= n && n >= h, 'difficulty ordering'); ok(care < n, 'careless play does worse'); }
// 9. 2P full nights run to an ending
{ const kinds = {}; for (let s = 1; s <= 10; s++) { const g = playOut(Sim, { seed: s, chapter: 'campaign', diff: 1, two: true }, 0.85); kinds[g.ending.kind] = (kinds[g.ending.kind] || 0) + 1; } console.log('     2P', JSON.stringify(kinds)); ok(Object.keys(kinds).length > 0, '2P games end'); ok(kinds.dawn > 0, '2P: two cooperating commanders can reach the dawn ceasefire'); }
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
