// GENESIS offline run: the agent acts as the LLM designer (proposals, rationales, critiques written in
// tools/lineage.mjs); this script does everything else with real code and writes data/archive.json.
//   node tools/offline.mjs [upToGen]
// Selection is by THE REAPER's score on the generation's fresh selection battery ONLY. The sealed battery is
// run for the report and never consulted for selection.
import fs from 'fs';
import { evaluate, makeBattery, selectionSeed, SEALED_SEED, reaperRank, TASKS, chanceOf, CRIT } from '../js/tasks.js';
import { baseGenome, codeFor, mutate, crossover, clone, describe, paradigmsOf, GENES, BIASES, MECHS, PARADIGMS } from '../js/genome.js';
import { hybridCode } from '../js/mutate.js';
import { mulberry32 } from '../js/tasks.js';
import { GENS, BRAINS } from './lineage.mjs';
const upTo = +(process.argv[2] || 99);
const LIB = Object.fromEntries(fs.readdirSync(new URL('../designs/', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_')).map(f => [f.replace('.js', ''), fs.readFileSync(new URL('../designs/' + f, import.meta.url), 'utf8')]));
const cacheF = new URL('../data/.cache.json', import.meta.url);
const cache = fs.existsSync(cacheF) ? JSON.parse(fs.readFileSync(cacheF, 'utf8')) : {};
const byId = {}, out = [];
const strip = r => ({ ...r, per: r.per.map(p => ({ ...p, curve: p.curve })) });
function evalCached(key, design, streams) { if (!cache[key]) { cache[key] = evaluate(design, streams); fs.writeFileSync(cacheF, JSON.stringify(cache)); } return cache[key]; }
let prev = null;
for (const G of GENS) {
  if (G.gen > upTo) break;
  const seedG = prev && prev.passed[0], partnerG = prev && prev.passed[1];
  const entries = [];
  G.entries.forEach((e, order) => {
    let genome, ops = [], parents = [];
    if (e.genome) { genome = clone(e.genome); parents = e.parents || []; ops = e.edits || []; }
    if (e.from) { // genome built from the previous generation's winners
      const P = id => clone(byId[id === 'seed' ? seedG : id === 'partner' ? partnerG : id].genome);
      const r = mulberry32(e.from.seed || G.gen * 100 + order);
      const pid = id => id === 'seed' ? seedG : id === 'partner' ? partnerG : id;
      if (e.from.op === 'edit') { genome = P(e.from.parent); e.from.apply(genome); parents = [pid(e.from.parent)]; ops = e.edits; }
      if (e.from.op === 'mutate') { const m = mutate(P(e.from.parent), r, e.from.rate || 0.35); genome = m.genome; ops = m.changes.length ? m.changes : ['no copy errors']; parents = [pid(e.from.parent)]; }
      if (e.from.op === 'crossover') { const c = crossover(P(e.from.parents[0]), P(e.from.parents[1]), r); genome = c.genome; ops = c.changes; parents = e.from.parents.map(pid);
        if (e.from.thenMutate) { const m = mutate(genome, r, e.from.thenMutate); genome = m.genome; ops = ops.concat(m.changes); } }
    }
    const id = `g${G.gen}-${e.slot}`;
    const design = { code: codeFor(genome, LIB, hybridCode), genome };
    const gk = JSON.stringify(genome);
    const dev = evalCached('dev|' + gk, design, makeBattery('dev', 1));
    const sel = evalCached(`sel${G.gen}|` + gk, design, makeBattery('selection', selectionSeed(G.gen)));
    const sealed = evalCached('sealed|' + gk, design, makeBattery('sealed', SEALED_SEED));
    const ent = { id, gen: G.gen, slot: e.slot, brain: e.slot === 'W' ? 'W' : e.slot[0], order, name: e.name, paradigm: describe(genome), paradigms: paradigmsOf(genome), genome, parents, ops,
      origin: e.origin, rationale: e.rationale, critique: (G.critiques || {})[e.slot] || null, dev, sel, sealed };
    byId[id] = ent; entries.push(ent);
    console.log(`gen ${G.gen} ${e.slot.padEnd(2)} ${ent.paradigm.slice(0, 60).padEnd(60)} dev ${dev.score.toFixed(3)} | SEL score ${sel.score.toFixed(3)} S ${sel.S.toFixed(3)} Q ${sel.Q.toFixed(3)} X ${sel.X.toFixed(3)} solved ${sel.solvedStreams}/${sel.streams} med.steps ${sel.medianSteps} | sealed ${sealed.score.toFixed(3)}  ${ops.slice(0, 4).join('; ')}`);
  });
  const ranked = reaperRank(entries);
  ranked.forEach((e, i) => { e.rank = i + 1; e.fate = i === 0 ? 'passed on: seed of both brains' : i === 1 ? 'passed on: crossover partner' : 'suppressed'; });
  const passed = ranked.slice(0, 2).map(e => e.id);
  const w = ranked[0];
  const verdict = { winner: w.id, winnerBrain: w.brain, passed, suppressed: ranked.slice(2).map(e => e.id), margin: +(ranked[0].sel.score - ranked[1].sel.score).toFixed(4),
    text: `${w.slot} ${w.paradigm} wins with REAPER ${w.sel.score.toFixed(3)} (S ${w.sel.S.toFixed(2)}, Q ${w.sel.Q.toFixed(2)}, X ${w.sel.X.toFixed(2)}), ${(ranked[0].sel.score - ranked[1].sel.score).toFixed(3)} ahead of ${ranked[1].slot}.` };
  console.log('  REAPER:', verdict.text, 'passed', passed.join(','));
  out.push({ gen: G.gen, title: G.title, note: G.note || '', selectionSeed: selectionSeed(G.gen), entries, verdict, llmLog: G.llmLog || null });
  prev = { passed };
}
/* POST-HOC AUDIT (never used for selection): how noisy is one battery? Re-run the first and the last
   generation on 4 more fresh selection batteries. */
const AUD = [0, 1, 2, 3].map(i => selectionSeed(500 + i));
const audit = {};
for (const g of [out[0], out[out.length - 1]]) for (const e of g.entries) {
  const design = { code: codeFor(e.genome, LIB, hybridCode), genome: e.genome }, gk = JSON.stringify(e.genome);
  const sc = AUD.map(sd => evalCached(`aud${sd}|` + gk, design, makeBattery('selection', sd)).score);
  const m = sc.reduce((a, b) => a + b, 0) / sc.length, sd = Math.sqrt(sc.reduce((a, b) => a + (b - m) ** 2, 0) / (sc.length - 1));
  audit[e.id] = { scores: sc, mean: +m.toFixed(4), sd: +sd.toFixed(4) };
  console.log('audit', e.id, sc.map(v => v.toFixed(3)).join(' '), 'mean', m.toFixed(3), 'sd', sd.toFixed(3));
}
const archive = { audit, auditSeeds: AUD,
  version: 1, built: new Date().toISOString(), engine: 'offline: the agent acted as the LLM designer (proposals, rationales, critiques); evaluation, ranking and selection are code',
  brains: BRAINS, crit: CRIT, sealedSeed: SEALED_SEED,
  tasks: TASKS.map(t => ({ id: t.id, name: t.name, icon: t.icon, domain: t.domain, split: t.split, blurb: t.blurb, answers: t.answers, chance: +chanceOf(t.id).toFixed(4) })),
  genes: GENES, biases: BIASES, mechs: MECHS, paradigms: PARADIGMS, library: LIB, gens: out,
};
fs.writeFileSync(new URL('../data/archive.json', import.meta.url), JSON.stringify(archive));
console.log('archive written', (JSON.stringify(archive).length / 1024).toFixed(0), 'KB');
