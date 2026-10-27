// Word completion spike diagnostics: per trial, association spikes in the item's tiles vs other tiles, area totals
import { CONTEST, makeBrain, runTrial, itemsAt } from '../js/contests.js';
import { gen0Genome } from '../js/genome.js';
import { CB, CAREAS } from '../js/cbrain.js'; for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
const [size = '2800', n = '6', ...kv] = process.argv.slice(2); const over = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
const C = CONTEST.text, g = { ...gen0Genome(1001), ...over }, b = makeBrain(C, g, null, +size, true), items = itemsAt(C, 4);
const tileIdx = new Map(C.tiles.map((t, i) => [t[0] * 1000 + t[1], i]));
for (let i = 0; i < +n; i++) {
  const it = items[i * 37 % items.length], on = new Set(it[1].map(x => tileIdx.get(it[0] * 1000 + x)));
  const a0 = Array.from(b.areaSpk); const cA = new Uint32Array(b.NA);
  const orig = b.accept.bind(b); b.accept = (...a) => { cA.set(b.cntA); return orig(...a); };
  const r = runTrial([b], C, it, { learn: true });
  let sOn = 0, nOn = 0, sOff = 0, nOff = 0; for (let a = 0; a < b.NA; a++) { if (on.has(b.tileOf[a])) { sOn += cA[a]; nOn++; } else { sOff += cA[a]; nOff++; } }
  const dA = Array.from(b.areaSpk).map((v, k) => v - a0[k]);
  console.log(it[3], 'want', it[5], 'got', r[0].c >= 0 ? C.labels[r[0].c] : '-', '| tile cells', nOn, 'spk/cell on', (sOn / Math.max(1, nOn)).toFixed(2), 'off', (sOff / nOff).toFixed(3), '| areas', CAREAS.map((k, j) => k + ':' + dA[j]).join(' '));
}
