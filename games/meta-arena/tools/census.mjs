// node tools/census.mjs [dev|selection|sealed] paradigm ...   (selection = generation 1's battery)
import fs from 'fs';
import { evaluate, makeBattery, selectionSeed, SEALED_SEED, chanceOf } from '../js/tasks.js';
import { baseGenome, codeFor } from '../js/genome.js';
import { hybridCode } from '../js/mutate.js';
const kind = process.argv[2] || 'selection';
const LIB = Object.fromEntries(fs.readdirSync(new URL('../designs/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => [f.replace('.js', ''), fs.readFileSync(new URL('../designs/' + f, import.meta.url), 'utf8')]));
const streams = makeBattery(kind, kind === 'dev' ? 1 : kind === 'sealed' ? SEALED_SEED : selectionSeed(1));
const list = process.argv.slice(3).length ? process.argv.slice(3) : ['baseline', 'rule', 'memory', 'nexttoken', 'spiking', 'bayes', 'gp'];
const pc = v => v == null ? '  - ' : (v * 100).toFixed(0).padStart(3) + '%';
console.log('stream'.padEnd(10), list.map(p => p.slice(0, 9).padStart(10)).join(''));
const res = {};
for (const p of list) { const g = p.startsWith('{') ? JSON.parse(p) : baseGenome(p); const t0 = Date.now(); res[p] = evaluate({ code: codeFor(g, LIB, hybridCode), genome: g }, streams); res[p].t = Date.now() - t0; }
streams.forEach((st, i) => console.log((st.family.slice(0, 8) + (st.scrambled ? '*' : '')).padEnd(10), list.map(p => { const r = res[p].per[i]; return (pc(r.solved) + (r.steps ? String(r.steps).padStart(4) : '   -')).padStart(10); }).join(''), ' chance', pc(chanceOf(st.family))));
for (const k of ['S', 'Q', 'X', 'score', 'transferRatio', 'solvedStreams', 'medianSteps', 'meanSize', 't']) console.log(k.padEnd(10), list.map(p => String(res[p][k]).padStart(10)).join(''));
console.log(list.map(p => res[p].per.map(r => r.err).filter(Boolean)[0] || '').join(' | '));
