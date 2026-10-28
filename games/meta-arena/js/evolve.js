/* GENESIS breeding rules (browser continuation; the offline run in tools/ follows the same rules).
   After THE REAPER ranks a generation, rank 1 is PASSED ON as the seed of BOTH brains, rank 2 is passed on as
   the crossover partner, everyone else is SUPPRESSED. The next generation has five slots:
     A1  Brain A's proposal built from the seed (live LLM edit if a key is set, else built-in mutation)
     A2  built-in crossover(seed, partner) + light copy errors
     B1  Brain B's proposal built from the seed (live LLM edit if a key is set, else built-in mutation)
     B2  built-in mutation(seed)
     W   WILD CARD: a paradigm that is NOT in the seed (live LLM open-ended code if a key is set, else a
         random library paradigm with a jittered genome). The slot is protected; the design is not. */
import { mutate, crossover, clone, baseGenome, paradigmsOf, OPEN_ENDED } from './genome.js';
export const CORE = ['rule', 'memory', 'nexttoken', 'spiking'];
export function wildGenome(seed, r) {
  const used = new Set(paradigmsOf(seed));
  const pool = CORE.concat(OPEN_ENDED).filter(p => !used.has(p));
  const p = pool[Math.floor(r() * pool.length)] || 'relational';
  let g = baseGenome(p, { genes: { depth: 1 + Math.floor(r() * 3) } });
  g = mutate(g, r, 0.8).genome;
  return { genome: g, ops: [`heresy: ${p} (not in the seed), heavily mutated genome`] };
}
export function breedBuiltIn(seedEnt, partnerEnt, r) {
  const S = seedEnt.genome, P = partnerEnt.genome;
  const a1 = mutate(clone(S), r, 0.35), b1 = mutate(clone(S), r, 0.35), b2 = mutate(clone(S), r, 0.25);
  const x = crossover(clone(S), clone(P), r), a2 = mutate(x.genome, r, 0.2);
  const w = wildGenome(S, r);
  return [
    { slot: 'A1', name: 'Brain A mutant', origin: 'built-in operator (browser): mutate(seed)', genome: a1.genome, ops: a1.changes, parents: [seedEnt.id] },
    { slot: 'A2', name: 'Crossing', origin: 'built-in operator (browser): crossover(seed, partner) + mutate', genome: a2.genome, ops: x.changes.concat(a2.changes), parents: [seedEnt.id, partnerEnt.id] },
    { slot: 'B1', name: 'Brain B mutant', origin: 'built-in operator (browser): mutate(seed)', genome: b1.genome, ops: b1.changes, parents: [seedEnt.id] },
    { slot: 'B2', name: 'Copy-error seed', origin: 'built-in operator (browser): mutate(seed)', genome: b2.genome, ops: b2.changes, parents: [seedEnt.id] },
    { slot: 'W', name: 'Heretic', origin: 'built-in operator (browser): wild card heresy', genome: w.genome, ops: w.ops, parents: [] },
  ];
}
