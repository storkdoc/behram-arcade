// Unit tests for the CTG engine (js/ctg.js): node games/dr-behrams-office/triage/tests/ctg.test.js
// Checks that generated NICHD patterns look like what they claim (ground truth), and that the independent analyzer,
// reading only the raw samples, classifies them the same way.
const CTG = require('../js/ctg.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const HZ = CTG.HZ, T = 1800;
const sim = (p, seed) => { const s = new CTG.Sim(p, seed); s.run(T); return s; };
const seeds = [1, 2, 3, 4, 5, 6];
const frac = (arr, f) => arr.filter(f).length / arr.length;

// determinism
{ const a = sim({ upi: 0.6 }, 7), b = sim({ upi: 0.6 }, 7), c = sim({ upi: 0.6 }, 8);
  ok(a.fhr.length === T * HZ && a.fhr.every((v, i) => (v === b.fhr[i]) || (v !== v && b.fhr[i] !== b.fhr[i])), 'same seed → identical strip');
  ok(a.fhr.some((v, i) => v !== c.fhr[i]), 'different seed → different strip'); }

// physiological ranges
{ const s = sim({}, 3); const v = s.fhr.filter(x => x === x); ok(v.every(x => x > 50 && x < 210), 'FHR stays in 50–210'); ok(s.uc.every(x => x >= 0 && x <= 100), 'UC stays in 0–100 mmHg'); }

// Category I reactive
{ const r = seeds.map(sd => { const s = sim({ base: 135 }, sd); return { T: s.truth(T), A: CTG.analyze(s.fhr, s.uc, T) }; });
  ok(r.every(x => x.T.category === 1 && x.T.variability === 'moderate'), 'normal params → truth Category I, moderate variability');
  ok(r.every(x => Math.abs(x.A.baseline - 135) <= 5), 'analyzer baseline within 5 bpm of 135 (' + r.map(x => x.A.baseline) + ')');
  ok(r.every(x => x.A.accels > 0), 'analyzer finds accelerations (15×15) in a reactive strip');
  ok(r.every(x => x.A.predominant === 'none' && x.A.category === 1), 'analyzer: no decels, Category I'); }

// early decels: nadir coincides with the contraction peak
{ const s = sim({ head: 1 }, 2), E = s.decels.filter(d => d.type === 'early');
  ok(E.length >= 4, 'head compression → early decels (' + E.length + ')');
  ok(E.every(d => { const c = s.ucs[d.uc]; return Math.abs(d.tn - c.tp) <= 6; }), 'early: nadir within 6 s of the contraction peak');
  ok(E.every(d => d.dur / 2 >= 30), 'early: gradual (onset to nadir ≥ 30 s)');
  const A = seeds.map(sd => { const x = sim({ head: 1 }, sd); return CTG.analyze(x.fhr, x.uc, T).predominant; });
  ok(frac(A, p => p === 'early') >= 5 / 6, 'analyzer calls early decels early (' + A + ')'); }

// late decels: nadir after the contraction peak, recurrent
{ const s = sim({ upi: 0.62 }, 4), L = s.decels.filter(d => d.type === 'late');
  ok(L.length >= 4, 'uteroplacental insufficiency → late decels (' + L.length + ')');
  ok(L.every(d => d.tn - s.ucs[d.uc].tp >= 15), 'late: nadir ≥ 15 s after the contraction peak');
  ok(L.every(d => d.dur / 2 >= 30), 'late: gradual (onset to nadir ≥ 30 s)');
  const A = seeds.map(sd => { const x = sim({ upi: 0.62 }, sd); return CTG.analyze(x.fhr, x.uc, T); });
  ok(frac(A, a => a.predominant === 'late-rec') >= 5 / 6, 'analyzer calls recurrent lates (' + A.map(a => a.predominant) + ')');
  ok(A.every(a => a.category === 2 || a.category === 3), 'recurrent lates are not Category I'); }

// variable decels: abrupt (onset to nadir < 30 s), ≥15 bpm, ≥15 s
{ const s = sim({ cord: 0.7 }, 5), V = s.decels.filter(d => d.type === 'variable');
  ok(V.length >= 4, 'cord compression → variable decels (' + V.length + ')');
  ok(V.every(d => d.fall < 30 && d.depth >= 15 && d.dur >= 15), 'variable: abrupt, ≥15 bpm, ≥15 s');
  const A = seeds.map(sd => { const x = sim({ cord: 0.7 }, sd); return CTG.analyze(x.fhr, x.uc, T).predominant; });
  ok(frac(A, p => p === 'var-rec') >= 5 / 6, 'analyzer calls recurrent variables (' + A + ')'); }

// tachysystole: > 5 contractions / 10 min averaged over 30 min
{ const s = sim({ oxy: 18, oxyEff: 18 }, 6), n = s.ucs.filter(c => c.t0 >= 0).length / 3;
  const Tr = s.truth(T), A = CTG.analyze(s.fhr, s.uc, T);
  ok(n > 5 && Tr.tachysystole, 'high oxytocin → tachysystole (' + n.toFixed(1) + '/10 min)');
  ok(A.tachysystole === true, 'analyzer counts tachysystole (' + A.ucPer10 + '/10 min)');
  const q = sim({}, 6); ok(!q.truth(T).tachysystole && !CTG.analyze(q.fhr, q.uc, T).tachysystole, 'spontaneous labor: no tachysystole'); }

// minimal variability (magnesium) and sinusoidal
{ const A = seeds.map(sd => { const x = sim({ mag: 1, accRate: 0 }, sd); return [x.truth(T).variability, CTG.analyze(x.fhr, x.uc, T).variability]; });
  ok(A.every(a => a[0] === 'minimal'), 'magnesium → truth minimal variability'); ok(frac(A, a => a[1] === 'minimal') >= 5 / 6, 'analyzer: minimal (' + A.map(a => a[1]) + ')');
  const S = seeds.map(sd => { const x = sim({ sinus: 1, accRate: 0, ucInt: 6 }, sd); return [x.truth(T), CTG.analyze(x.fhr, x.uc, T)]; });
  ok(S.every(a => a[0].variability === 'sinusoidal' && a[0].category === 3), 'sinusoidal → truth Category III');
  ok(frac(S, a => a[1].variability === 'sinusoidal') >= 5 / 6, 'analyzer detects the sinusoidal pattern (' + S.map(a => a[1].variability) + ')');
  const N = seeds.map(sd => { const x = sim({ cord: 0.7 }, sd); return CTG.analyze(x.fhr, x.uc, T).variability; });
  ok(N.every(v => v !== 'sinusoidal'), 'no false sinusoidal calls on variable decels'); }

// prolonged decel: 2–10 min
{ const s = new CTG.Sim({}, 9); s.run(1200); s.set({ hypo: 0.9 }); s.run(240); s.set({ hypo: 0 }); s.run(360); // maternal hypotension → prolonged decel
  const P = s.drops.filter(d => d.dur >= 120 && d.dur < 600); ok(P.length === 1, 'a 4-min drop is logged as one prolonged decel (' + s.drops.map(d => Math.round(d.dur)) + ' s)');
  ok(s.truth(1800).predominant === 'prolonged', 'truth names it prolonged'); ok(CTG.analyze(s.fhr, s.uc, 1800).predominant === 'prolonged', 'analyzer names it prolonged'); }

// NICHD category rules
ok(CTG.category({ baseline: 140, variability: 'moderate' }) === 1, 'category: normal → I');
ok(CTG.category({ baseline: 140, variability: 'absent', lateRecurrent: true }) === 3, 'category: absent var + recurrent lates → III');
ok(CTG.category({ baseline: 100, variability: 'absent', brady: true }) === 3, 'category: absent var + bradycardia → III');
ok(CTG.category({ baseline: 140, variability: 'minimal' }) === 2, 'category: minimal var alone → II');
ok(CTG.category({ baseline: 170, variability: 'moderate' }) === 2, 'category: tachycardia → II');
ok(CTG.category({ baseline: 140, variability: 'sinusoidal' }) === 3, 'category: sinusoidal → III');

// cord gas follows reserve
{ const a = new CTG.Sim({ reserve: 0.95 }, 1), b = new CTG.Sim({ reserve: 0.1 }, 1); ok(a.cordGas().pH > 7.2 && b.cordGas().pH < 7.05, 'cord gas pH follows fetal reserve (' + a.cordGas().pH + ' vs ' + b.cordGas().pH + ')'); }

console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
