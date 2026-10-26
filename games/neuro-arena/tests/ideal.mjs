// capacity check: hand-wire the plastic Assoc->Motor synapses to the correct answer of each cell's preferred item; benchmark it
import { CONTEST, makeBrain, choiceBenchmark, TRIAL, DEC } from '../js/contests.js';
if (process.env.MIN) TRIAL.minMs = +process.env.MIN; if (process.env.DK) DEC.k = +process.env.DK;
import { gen0Genome } from '../js/genome.js';
import { CB } from '../js/cbrain.js'; for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
const [id = 'add', size = '2800', ...kv] = process.argv.slice(2); const over = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
const C = CONTEST[id], g = { ...gen0Genome(1001), ...over }, b = makeBrain(C, g, null, +size, true), L = b.L;
const ansOf = new Int16Array(b.NA).fill(-1);
for (let a = 0; a < b.NA; a++) { const i = L.A_E.s + a, x0 = Math.floor(b.c1[i] * C.n[0]), x1 = Math.floor(b.c2[i] * C.n[1]); const it = C.all_.find(t => t[0] === x0 && t[1] === x1); if (it) ansOf[a] = it[2]; }
for (let a = 0; a < b.NA; a++) for (let s = b.rowS[a]; s < b.rowS[a + 1]; s++) b.W[s] = ansOf[a] === b.grp[b.rowM[s]] ? g.wMax : 0;
const t0 = Date.now(), x = choiceBenchmark(C, g, b.exportWeights(), +size, +(process.env.LV || 0));
console.log(id, 'N', b.N, 'ideal acc', x.acc.toFixed(3), 'fit', x.fit.toFixed(3), 'wrong', x.wrong, 'abst', x.abstain, 'lat', Math.round(x.lat), 'chance', C.chance.toFixed(3), 'wall', (Date.now() - t0) / 1000);
