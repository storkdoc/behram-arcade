// headless lifetime-learning test for the choice contests: one brain trains on random items (learning on);
// the frozen Reaper benchmark is measured at checkpoints. usage: node tests/learn.mjs <contest> <trials> <seeds> [size] [checkEvery]
import { CONTEST, makeBrain, runTrial, choiceBenchmark, TRIAL } from '../js/contests.js';
import { gen0Genome } from '../js/genome.js';
import { mulberry32 } from '../js/brain.js';
import { CB } from '../js/cbrain.js'; import { DEC, TRIAL as TR } from '../js/contests.js';
for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
if (process.env.DK) DEC.k = +process.env.DK; for (const k of Object.keys(TR)) if (process.env['T_' + k] != null) TR[k] = +process.env['T_' + k];
const [id = 'add', NT = '600', seeds = '1', size = '2800', every = '200', ...kv] = process.argv.slice(2);
const C = CONTEST[id], over = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
const out = [];
const S0 = +(process.env.S0 || 1);
for (let sd = S0; sd < S0 + +seeds; sd++) {
  const g = { ...gen0Genome(1000 + sd), ...over };
  const b = makeBrain(C, g, null, +size), r = mulberry32(sd * 77);
  const row = [];
  const t0 = Date.now(); let simMs = 0, stats = { ok: 0, bad: 0, ab: 0, n: 0, lat: 0 };
  const bm = () => { const x = choiceBenchmark(C, g, b.exportWeights(), +size); row.push({ trials: stats.n, simS: +(simMs / 1000).toFixed(1), acc: +x.acc.toFixed(3), fit: +x.fit.toFixed(3), wrong: x.wrong, abst: x.abstain, lat: x.lat && Math.round(x.lat) }); };
  bm();
  for (let k = 1; k <= +NT; k++) {
    const it = C.items[Math.floor(r() * C.items.length)], [o] = runTrial([b], C, it);
    simMs += (o.t || TRIAL.maxMs) + TRIAL.iti; stats.n++; if (o.j.abst) stats.ab++; else if (o.j.bad) stats.bad++; else stats.ok++;
    if (k % +every === 0) { const tr = { ...stats }; bm(); row[row.length - 1].trainAcc = +(tr.ok / every).toFixed(2); row[row.length-1].trainAbst = +(tr.ab / every).toFixed(2); stats = { ok: 0, bad: 0, ab: 0, n: k, lat: 0 }; }
  }
  const wall = (Date.now() - t0) / 1000;
  out.push({ seed: sd, wall, rt: +(simMs / 1000 / wall).toFixed(2), row });
  console.log(JSON.stringify({ contest: id, seed: sd, size: b.N, chance: C.chance, wallS: wall, realtimeX: +(simMs / 1000 / wall).toFixed(2) }));
  for (const x of row) console.log('  ', JSON.stringify(x));
}
