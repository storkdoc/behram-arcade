import { CONTEST, makeBrain } from '../js/contests.js';
import { gen0Genome } from '../js/genome.js';
import { CB } from '../js/cbrain.js'; for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
const [id='add', ...kv] = process.argv.slice(2); const over = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
const C = CONTEST[id], g = { ...gen0Genome(1001), ...over }, b = makeBrain(C, g, null, 2800, true);
const L = b.L, pats = [];
const rate = (s, e, ms) => { let n = 0; for (let i = s; i < e; i++) n += b.cnt[i]; return n / (e - s) / ms * 1000; };
for (const it of C.items) {
  b.blank(); b.run(200); b.sense(it[0], it[1]);
  const cnt = new Float32Array(b.N); b.cnt = cnt; const ms = 150;
  for (let t = 0; t < ms * 2; t++) { b.spk.fill(0); b.run(1); for (let i = 0; i < b.N; i++) if (b.spk[i]) cnt[i]++; }
  pats.push({ it, A: cnt.slice(L.A_E.s, L.A_E.e), r: Object.fromEntries(L.def.map(([k]) => [k, +rate(L[k].s, L[k].e, ms).toFixed(1)])) });
}
console.log('rates item0', pats[0].r);
const cos = (a, c) => { let x = 0, y = 0, z = 0; for (let i = 0; i < a.length; i++) { x += a[i] * c[i]; y += a[i] * a[i]; z += c[i] * c[i]; } return x / Math.sqrt(y * z + 1e-9); };
let sameAns = [], diff = [], act = [];
for (let i = 0; i < pats.length; i++) { act.push(pats[i].A.filter(v => v > 2).length); for (let j = i + 1; j < pats.length; j++) { const c = cos(pats[i].A, pats[j].A); (pats[i].it[2] === pats[j].it[2] ? sameAns : diff).push(c); } }
const m = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(3);
console.log('active A cells per item', m(act), 'cos same answer', m(sameAns), 'cos diff answer', m(diff), 'max diff', Math.max(...diff).toFixed(3));
{ let inT = 0, tot = 0, inC = 0, rIn = 0, rOut = 0, nIn = 0, nOut = 0;
  for (const p of pats) { const [x0, x1] = p.it; for (let a = 0; a < p.A.length; a++) { const i = L.A_E.s + a; const d0 = Math.abs(b.c1[i] - (x0 + 0.5) / C.n[0]), d1 = Math.abs(b.c2[i] - (x1 + 0.5) / C.n[1]);
    const inside = d0 < 0.5 / C.n[0] && d1 < 0.5 / C.n[1]; tot += p.A[a]; if (inside) { inT += p.A[a]; rIn += p.A[a]; nIn++; } else { rOut += p.A[a]; nOut++; } } }
  console.log('frac A spikes inside combo tile', (inT / tot).toFixed(3), 'rate in tile Hz', (rIn / nIn / 0.15).toFixed(1), 'rate outside Hz', (rOut / nOut / 0.15).toFixed(1), 'cells in tile', (nIn / pats.length).toFixed(1));
  // slot-only cells: matching one coordinate
}
