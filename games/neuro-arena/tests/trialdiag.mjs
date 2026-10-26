// prints the per-trial window counts of the answer populations (debugging the ACCEPT step)
import { CONTEST, makeBrain, runTrial, TRIAL } from '../js/contests.js';
import { gen0Genome } from '../js/genome.js';
import { CB } from '../js/cbrain.js';
for (const k of Object.keys(CB)) if (process.env['CB_' + k] != null) CB[k] = +process.env['CB_' + k];
for (const k of Object.keys(TRIAL)) if (process.env['T_' + k] != null) TRIAL[k] = +process.env['T_' + k];
const [id = 'add', n = '12', ...kv] = process.argv.slice(2); const over = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
const C = CONTEST[id], g = { ...gen0Genome(1001), ...over }, b = makeBrain(C, g, null, 2800);
console.log('gs', b.L.gs, 'margin', b.margin);
for (let i = 0; i < +n; i++) { const IT = (await import('../js/contests.js')).itemsAt(C, 0), it = IT[i % IT.length], [o] = runTrial([b], C, it); console.log(it[3], 'want', it[2], 'got', o.c, 'conf', o.conf, 'da', o.da, o.cnt && o.cnt.join(' ')); }
