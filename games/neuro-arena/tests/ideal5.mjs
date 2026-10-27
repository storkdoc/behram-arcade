// capacity check for Word completion: hand-wire Assoc->Motor with the co-occurrence of each conjunction tile
// (blank at p, letter l at q) with each answer letter at the level (weight ~ P(letter | tile)); benchmark it
import { CONTEST, makeBrain, choiceBenchmark, itemsAt } from '../js/contests.js';
import { gen0Genome } from '../js/genome.js';
import { CB } from '../js/cbrain.js'; for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
import { TRIAL } from '../js/contests.js'; for (const k of Object.keys(TRIAL)) if (process.env['T_' + k] != null) TRIAL[k] = +process.env['T_' + k];
const [size = '2800', lv = '4', pw = '1'] = process.argv.slice(2);
const C0 = CONTEST[process.env.CID || 'text']; if (process.env.T_thinkMs) C0.trial = { ...(C0.trial || {}), thinkMs: +process.env.T_thinkMs }; for (const k of ['aBias', 'wSA', 'split', 'mW']) if (process.env['C_' + k] != null) C0[k] = +process.env['C_' + k];
const C = C0, g = gen0Genome(1001), b = makeBrain(C, g, null, +size, true), L = b.L, items = itemsAt(C, +lv);
const cnt = new Map(); for (const it of items) for (const x of it[1]) { const key = it[0] * 1000 + x; if (!cnt.has(key)) cnt.set(key, new Float32Array(C.K)); cnt.get(key)[it[2]]++; }
const pc = [0, 1, 2, 3, 4].map(p => { const v = new Float32Array(C.K); for (const it of items) if (it[0] === p) v[it[2]]++; return v; });
for (let a = 0; a < b.NA; a++) { const t = b.allT[b.tileOf[a]], v = t[1] < 0 ? pc[t[0]] : cnt.get(t[0] * 1000 + t[1]); if (v && process.env.CENTER) { const sm = v.reduce((a, b) => a + b, 0) || 1; const u = Float32Array.from(v, y => Math.max(0, y / sm - 1 / C.K)); v.set(u); }
  const mx = v ? Math.max(...v) || 1 : 1;
  for (let s = b.rowS[a]; s < b.rowS[a + 1]; s++) b.W[s] = v ? (+(process.env.WS || 1)) * g.wMax * Math.pow(v[b.grp[b.rowM[s]]] / mx, +pw) : 0; }
import { mulberry32 } from '../js/brain.js';
const NB = +(process.env.NB || 0), set = NB ? (() => { const a = [...items], q = mulberry32(4242); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(q() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, NB); })() : null;
const t0 = Date.now(), x = choiceBenchmark(C, g, b.exportWeights(), +size, +lv, set);
console.log(C.id, 'N', b.N, 'level', lv, 'ideal acc', x.acc.toFixed(3), 'alt', x.alt, 'wrong', x.wrong, 'abst', x.abstain, 'chance', C.chance.toFixed(3), 'bal', x.bal != null ? x.bal.toFixed(3) : '-', 'base', x.base != null ? x.base.toFixed(3) : '-', 'wall', (Date.now() - t0) / 1000);
