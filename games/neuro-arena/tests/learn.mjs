// headless lifetime-learning test for the choice contests: one brain trains on random items (learning on) through the
// explicit PRESENT/THINK/ACCEPT/JUDGE/REWARD loop, with the automatic curriculum (contests with levels).
// The frozen Reaper benchmark is measured at checkpoints, at the current level and on a fixed probe level.
// usage: node tests/learn.mjs <contest> <trials> <seeds> [size] [checkEvery]   env: S0 start seed, PROBE level index,
//        LV0 start level, CB_* / T_* / DK overrides, extra args gene=value
import { CONTEST, makeBrain, runTrial, choiceBenchmark, TRIAL, DEC, Curriculum, itemsAt, chanceAt, levelName, PRACTICE, CURR } from '../js/contests.js';
if (process.env.PC) PRACTICE.conf = +process.env.PC; if (process.env.BC) PRACTICE.test = +process.env.BC; if (process.env.CT) CURR.thr = +process.env.CT; if (process.env.CW) CURR.win = +process.env.CW;
import { gen0Genome } from '../js/genome.js';
import { mulberry32 } from '../js/brain.js';
import { CB } from '../js/cbrain.js';
for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
if (process.env.DK) DEC.k = +process.env.DK; for (const k of Object.keys(TRIAL)) if (process.env['T_' + k] != null) TRIAL[k] = +process.env['T_' + k];
const [id = 'add', NT = '600', seeds = '1', size = '2800', every = '200', ...kv] = process.argv.slice(2);
const C = CONTEST[id], over = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
const S0 = +(process.env.S0 || 1), PROBE = process.env.PROBE != null ? +process.env.PROBE : null;
for (let sd = S0; sd < S0 + +seeds; sd++) {
  const g = { ...gen0Genome(1000 + sd), ...over };
  const b = makeBrain(C, g, null, +size), r = mulberry32(sd * 77), cur = new Curriculum(C, +(process.env.LV0 || 0));
  const row = [], t0 = Date.now(); let simMs = 0, stats = { ok: 0, bad: 0, ab: 0 };
  const bm = k => { const x = choiceBenchmark(C, g, b.exportWeights(), +size, cur.level);
    const o = { trials: k, simS: +(simMs / 1000).toFixed(0), level: C.levels ? cur.level + 1 : null, acc: +x.acc.toFixed(2), fit: +x.fit.toFixed(2), wrong: x.wrong, abst: x.abstain, n: x.n, chance: +chanceAt(C, cur.level).toFixed(2) };
    if (PROBE != null) { const y = choiceBenchmark(C, g, b.exportWeights(), +size, PROBE); o.probe = +y.acc.toFixed(2); }
    row.push(o); return o; };
  console.log(JSON.stringify({ contest: id, seed: sd, size: b.N, probe: PROBE != null ? levelName(C, PROBE) : null }));
  console.log('  ', JSON.stringify(bm(0)));
  for (let k = 1; k <= +NT; k++) {
    const items = cur.items, it = items[Math.floor(r() * items.length)], [o] = runTrial([b], C, it);
    simMs += TRIAL.presentMs + TRIAL.thinkMs + TRIAL.commitMs + TRIAL.iti; if (o.j.abst) stats.ab++; else if (o.j.bad) stats.bad++; else stats.ok++;
    const up = cur.note(!o.j.abst && !o.j.bad, k); if (up) console.log('   level up ->', cur.level + 1, levelName(C, cur.level), 'at trial', k);
    if (k % +every === 0) { const x = bm(k); x.trainAcc = +(stats.ok / every).toFixed(2); x.trainAbst = +(stats.ab / every).toFixed(2); stats = { ok: 0, bad: 0, ab: 0 }; console.log('  ', JSON.stringify(x)); }
  }
  const wall = (Date.now() - t0) / 1000;
  console.log(JSON.stringify({ seed: sd, done: true, wallS: wall, realtimeX: +(simMs / 1000 / wall).toFixed(2), levelReached: cur.level + 1, ups: cur.ups }));
}
