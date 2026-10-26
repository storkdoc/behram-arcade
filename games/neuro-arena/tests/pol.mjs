import { CONTEST, makeBrain, runTrial } from '../js/contests.js';
import { gen0Genome } from '../js/genome.js';
import { mulberry32 } from '../js/brain.js';
import { CB } from '../js/cbrain.js'; for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
const [id = 'add', NT = '300', ...kv] = process.argv.slice(2); const over = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
const C = CONTEST[id], g = { ...gen0Genome(1001), ...over }, b = makeBrain(C, g, null, 2800), L = b.L, r = mulberry32(5);
const tileW = () => { // per item: mean w from its tile cells to each group
  let rankSum = 0, gapSum = 0;
  for (const it of C.items) { const s = new Float64Array(C.K), n = new Float64Array(C.K);
    for (let a = 0; a < b.NA; a++) { const i = L.A_E.s + a; if (Math.floor(b.c1[i] * C.n[0]) !== it[0] || Math.floor(b.c2[i] * C.n[1]) !== it[1]) continue; for (let q = b.rowS[a]; q < b.rowS[a + 1]; q++) { const k = b.grp[b.rowM[q]]; s[k] += b.W[q]; n[k]++; } }
    const m = Array.from(s, (v, k) => v / Math.max(1, n[k])); const c = m[it[2]]; rankSum += m.filter(v => v > c).length; gapSum += c - (m.reduce((x, y) => x + y, 0) - c) / (C.K - 1); }
  let wm = 0; for (const w of b.W) wm += w; return { rank: (rankSum / C.items.length).toFixed(2), gap: (gapSum / C.items.length).toFixed(4), wMean: (wm / b.W.length).toFixed(4) };
};
console.log(0, tileW());
let ok = 0, dsum = 0;
for (let k = 1; k <= +NT; k++) { const it = C.items[Math.floor(r() * C.items.length)]; const [o] = runTrial([b], C, it); if (!o.j.bad && !o.j.abst) ok++; if (k % 100 === 0) { console.log(k, 'acc', ok / 100, tileW(), 'daBar', b.daBar.toFixed(3)); ok = 0; } }
