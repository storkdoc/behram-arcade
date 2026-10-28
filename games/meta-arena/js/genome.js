/* GENESIS: the GENOME. An abstract blueprint of capabilities and constraints, not weights and not code.
   Every paradigm TRANSLATES the same genes into its own native machinery (see the top of each design's code:
   e.g. "memory capacity" is the episode store of the memory paradigm, the rehearsal buffer of the next-token
   predictor and the reservoir size of the spiking net). Genomes are copied, crossed over and mutated; the
   code of a design is a pure function of its genome's paradigm (plus, for hybrids, its parts). */
export const GENES = {
  memory:  { label: 'Memory capacity',      min: 0, max: 1, desc: 'how much experience it may keep (episode store, rehearsal buffer, reservoir size)' },
  depth:   { label: 'Abstraction depth',    min: 1, max: 3, int: true, desc: 'levels of abstraction (program depth, hidden width, similarity level)' },
  compose: { label: 'Compositionality',     min: 0, max: 1, desc: 'how freely parts combine (composed rules, pair features)' },
  search:  { label: 'Search budget',        min: 0, max: 1, desc: 'effort per trial (hypotheses kept, neighbours polled, replay steps, sim steps)' },
  lr:      { label: 'Learning rate',        min: 0, max: 1, desc: 'plasticity, log-scaled 0.003 … 0.3' },
  gate:    { label: 'Confidence gate',      min: 0.5, max: 0.95, desc: 'how sure it must be before it answers (THE REAPER charges −2 per wrong answer)' },
};
export const BIASES = { numeric: 'reads digits as numbers', positional: 'features tied to positions', relational: 'features of sameness between tokens (scramble-proof)', temporal: 'sequence / periodicity priors' };
export const MECHS = { metacog: 'abstains unless its own track record is good', replay: 'rehearses past episodes', attention: 'content-based attention', hebbian: 'reward-gated Hebbian plasticity', recode: 'reserved: not yet expressed by any paradigm (a neutral gene that copy errors can flip)' };
export const PARADIGMS = {
  rule:      { name: 'Rule induction', color: '#ffb347', glyph: 'crystal', desc: 'searches a grammar of symbolic programs and keeps the ones the evidence supports' },
  memory:    { name: 'Memory lookup', color: '#5ad1ff', glyph: 'orbs', desc: 'stores episodes and answers by recalling the most similar ones' },
  nexttoken: { name: 'Next-token predictor', color: '#c78bff', glyph: 'rings', desc: 'a transformer-lite trained online by backprop to predict the answer token' },
  spiking:   { name: 'Spiking network', color: '#ff5fa2', glyph: 'neuron', desc: 'leaky integrate-and-fire reservoir with reward-gated Hebbian readout' },
  bayes:     { name: 'Bayesian structure averaging', color: '#7dffb0', glyph: 'cloud', desc: 'open-ended (LLM-proposed): averages Dirichlet models over context subsets by evidence' },
  gp:        { name: 'Lifetime program evolution', color: '#ffe066', glyph: 'tree', desc: 'open-ended (LLM-proposed): evolves expression trees inside one lifetime' },
  relational:{ name: 'Relational recoder', color: '#ff8c5a', glyph: 'lattice', desc: 'open-ended (LLM-proposed): recodes tokens into roles, learns over role patterns' },
  hybrid:    { name: 'Hybrid', color: '#ffffff', glyph: 'chimera', desc: 'two complete learners under a cascade or arbiter controller' },
};
export const OPEN_ENDED = ['bayes', 'gp', 'relational'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function baseGenome(paradigm, over = {}) {
  return { paradigm, genes: { memory: 0.6, depth: 1, compose: 0.5, search: 0.5, lr: 0.5, gate: 0.7, ...(over.genes || {}) },
    biases: { numeric: true, positional: true, relational: false, temporal: true, ...(over.biases || {}) },
    mech: { metacog: true, replay: true, attention: true, hebbian: true, recode: false, ...(over.mech || {}) },
    ...(over.parts ? { parts: over.parts, mode: over.mode || 'cascade' } : {}) };
}
export const clone = g => JSON.parse(JSON.stringify(g));
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const roundG = (k, v) => GENES[k].int ? Math.round(clamp(v, GENES[k].min, GENES[k].max)) : +clamp(v, GENES[k].min, GENES[k].max).toFixed(3);
/* MUTATION (copy errors): each gene moves with p = rate by N(0, 0.15 of its range); each bias / mechanism
   flips with p = rate / 2. Returns the child and a readable list of the changes. */
export function mutate(g, r, rate = 0.35) {
  const c = clone(g), ch = [];
  const walk = (gg, pre) => {
    for (const k in GENES) if (r() < rate) { const G = GENES[k], o = gg.genes[k]; const n = roundG(k, o + gauss(r) * 0.15 * (G.max - G.min) * (G.int ? 3 : 1)); if (n !== o) { gg.genes[k] = n; ch.push(`${pre}${G.label} ${o}→${n}`); } }
    for (const grp of ['biases', 'mech']) for (const k in gg[grp]) if (r() < rate / 2) { gg[grp][k] = !gg[grp][k]; ch.push(`${pre}${k} ${gg[grp][k] ? 'on' : 'off'}`); }
    if (gg.parts) gg.parts.forEach((p, i) => walk(p, `${pre}part ${i + 1}: `));
  };
  walk(c, '');
  if (c.parts && r() < rate / 3) { c.mode = c.mode === 'cascade' ? 'arbiter' : 'cascade'; ch.push(`controller → ${c.mode}`); }
  return { genome: c, changes: ch };
}
/* CROSSOVER: same paradigm → uniform crossover of every gene, bias and mechanism. Different paradigms →
   with p = 0.5 a HYBRID whose parts are both parents (a structural recombination), else the first parent's
   paradigm with genes drawn uniformly from both (the abstract blueprint transfers across paradigms). */
export function crossover(a, b, r) {
  if (a.paradigm !== b.paradigm && !a.parts && !b.parts && r() < 0.5) return { genome: baseGenome('hybrid', { parts: [clone(a), clone(b)], mode: r() < 0.5 ? 'cascade' : 'arbiter' }), changes: [`hybrid of ${a.paradigm} + ${b.paradigm}`] };
  const c = clone(a), ch = [];
  for (const k in GENES) if (r() < 0.5 && b.genes[k] != null && b.genes[k] !== c.genes[k]) { ch.push(`${GENES[k].label} ${c.genes[k]}→${b.genes[k]} (from ${b.paradigm})`); c.genes[k] = b.genes[k]; }
  for (const grp of ['biases', 'mech']) for (const k in c[grp]) if (r() < 0.5 && b[grp] && b[grp][k] !== undefined && b[grp][k] !== c[grp][k]) { c[grp][k] = b[grp][k]; ch.push(`${k} ${c[grp][k] ? 'on' : 'off'} (from ${b.paradigm})`); }
  return { genome: c, changes: ch.length ? ch : ['identical genes'] };
}
// the code for a genome: its paradigm's native implementation (hybrids: the generic controller over two parts)
export function codeFor(g, LIB, hybridCode) {
  if (g.paradigm === 'hybrid') return hybridCode(codeFor(g.parts[0], LIB, hybridCode), codeFor(g.parts[1], LIB, hybridCode), g.mode || 'cascade');
  if (g.code) return g.code;                       // an open-ended design that carries its own code (live LLM)
  const c = LIB[g.paradigm]; if (!c) throw new Error('no implementation for paradigm ' + g.paradigm); return c;
}
export function paradigmsOf(g) { return g.paradigm === 'hybrid' ? g.parts.flatMap(paradigmsOf) : [g.paradigm]; }
export function describe(g) {
  if (g.paradigm === 'hybrid') return `Hybrid (${g.mode}): ${g.parts.map(describe).join(' + ')}`;
  return (PARADIGMS[g.paradigm] || { name: g.paradigm }).name;
}
