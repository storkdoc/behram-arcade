// capacity check for Word completion: hand-wire Assoc->Motor with the co-occurrence of each conjunction tile
// (blank at p, letter l at q) with each answer letter at the level (weight ~ P(letter | tile)); benchmark it
import { CONTEST, makeBrain, choiceBenchmark, itemsAt } from '../js/contests.js';
import { gen0Genome } from '../js/genome.js';
import { CB } from '../js/cbrain.js'; for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
const [size = '2800', lv = '4', pw = '1'] = process.argv.slice(2);
const C0 = CONTEST.text; for (const k of ['aBias', 'wSA', 'split', 'mW']) if (process.env['C_' + k] != null) C0[k] = +process.env['C_' + k];
const C = C0, g = gen0Genome(1001), b = makeBrain(C, g, null, +size, true), L = b.L, items = itemsAt(C, +lv);
const cnt = new Map(); for (const it of items) for (const x of it[1]) { const key = it[0] * 1000 + x; if (!cnt.has(key)) cnt.set(key, new Float32Array(26)); cnt.get(key)[it[2]]++; }
const pc = [0, 1, 2, 3, 4].map(p => { const v = new Float32Array(26); for (const it of items) if (it[0] === p) v[it[2]]++; return v; });
for (let a = 0; a < b.NA; a++) { const t = b.allT[b.tileOf[a]], v = t[1] < 0 ? pc[t[0]] : cnt.get(t[0] * 1000 + t[1]); const mx = v ? Math.max(...v) : 1;
  for (let s = b.rowS[a]; s < b.rowS[a + 1]; s++) b.W[s] = v ? (+(process.env.WS || 1)) * g.wMax * Math.pow(v[b.grp[b.rowM[s]]] / mx, +pw) : 0; }
const NB = +(process.env.NB || 0), set = NB ? items.filter((_, i) => i % Math.floor(items.length / NB) === 0).slice(0, NB) : null;
const t0 = Date.now(), x = choiceBenchmark(C, g, b.exportWeights(), +size, +lv, set);
console.log('text N', b.N, 'level', lv, 'ideal acc', x.acc.toFixed(3), 'alt', x.alt, 'wrong', x.wrong, 'abst', x.abstain, 'chance', C.chance.toFixed(3), 'wall', (Date.now() - t0) / 1000);
