// why does accuracy drift DOWN within a duel? Train one brain to a plateau at a level, then run many fresh
// "lifetimes" (new brain from those weights, learning on, like a duel) and pool accuracy per block of trials.
// usage: node tests/lifetime.mjs <contest> <level> <pretrain> <lives> <trialsPerLife> [inheritRBar 0/1]
import { CONTEST, makeBrain, runTrial, itemsAt } from '../js/contests.js';
import { gen0Genome } from '../js/genome.js';
import { mulberry32 } from '../js/brain.js';
const [id = 'text', lv = '2', pre = '2000', lives = '20', per = '60', inh = '0'] = process.argv.slice(2);
const C = CONTEST[id], g = gen0Genome(1001), r = mulberry32(5), items = itemsAt(C, +lv), pick = () => items[Math.floor(r() * items.length)];
const ok = it => o => !o.j.bad && !o.j.abst;
let b = makeBrain(C, g, null, 2800); for (let k = 0; k < +pre; k++) runTrial([b], C, pick());
const W = b.exportWeights(); if (!+inh) delete W.rBar; console.log('pretrained rBar', b.rBar.toFixed(2));
const B = 10, acc = new Float64Array(Math.ceil(+per / B)), fro = new Float64Array(acc.length);
for (let l = 0; l < +lives; l++) { const x = makeBrain(C, g, W, 2800); for (let k = 0; k < +per; k++) { const [o] = runTrial([x], C, pick()); if (!o.j.bad && !o.j.abst) acc[Math.floor(k / B)]++; } }
for (let l = 0; l < +lives; l++) { const x = makeBrain(C, g, W, 2800, true); for (let k = 0; k < +per; k++) { const [o] = runTrial([x], C, pick()); if (!o.j.bad && !o.j.abst) fro[Math.floor(k / B)]++; } }
console.log('learning on, % right per', B, 'trials:', Array.from(acc, v => Math.round(100 * v / (+lives * B))).join(' '));
console.log('frozen weights,         :', Array.from(fro, v => Math.round(100 * v / (+lives * B))).join(' '));
