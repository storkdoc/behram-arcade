/* NEURO ARENA: evolution. The reigning champion spawns a challenger with copy errors; they duel;
   the winner keeps (or takes) the throne and the loser is replaced by the winner's next spawn. */
import { Brain, mulberry32 } from './brain.js';
import { Match } from './arena.js';
import { GENES, GENE, gen0Genome, copyGenome, copyWeights } from './genome.js';

export const DEFAULTS = { rate: 0.02, matchSec: 30, lamarck: true };

// run one complete duel headlessly. gA/gB genomes, wA/wB dense weights or null
export function runDuel(job) {
  const A = new Brain(job.gA, job.wA), B = new Brain(job.gB, job.wB);
  const m = new Match([{ brain: A }, { brain: B }], mulberry32(job.seed));
  m.stepMs(Math.round(job.matchSec * 1000));
  const st = m.stats();
  return { id: job.id, stats: st, wA: job.lamarck ? A.exportWeights() : null, wB: job.lamarck ? B.exportWeights() : null };
}
export const winnerOf = st => st.score[0] !== st.score[1] ? (st.score[0] > st.score[1] ? 0 : 1) : st.hitRate[0] !== st.hitRate[1] ? (st.hitRate[0] > st.hitRate[1] ? 0 : 1) : 0;

export class Evolution {
  constructor(opts = {}, state = null) {
    this.opts = { ...DEFAULTS, ...opts };
    if (state) { Object.assign(this, state); this.rnd = mulberry32((this.seedCounter = (this.seedCounter || 1) + 1) * 977); return; }
    this.gen = 0; this.seedCounter = 1; this.nextId = 2;
    this.champ = { id: 1, genome: gen0Genome(), weights: null, born: 0, n: 0, fit: 0, hits: 0, balls: 0 };
    this.history = []; this.hof = []; this.log = []; this.best = null;
    this.rnd = mulberry32(12345);
  }
  // make a challenger from the champion (or a Hall-of-Fame rematch)
  spawn() {
    const o = this.opts, c = this.champ;
    const hof = this.hof[0];
    if (hof && this.gen > 0 && this.gen % 25 === 0 && c.n >= 5 && hof.fit > c.fit + 0.08 && hof.id !== c.id)
      return { id: hof.id, genome: { ...hof.genome }, weights: hof.weights && o.lamarck ? new Float32Array(hof.weights) : null, errors: [], wErrors: 0, parent: c.id, hof: true, born: hof.born };
    const { genome, errors } = copyGenome(c.genome, o.rate, this.rnd);
    let weights = null, wErrors = 0;
    if (o.lamarck && c.weights) { const r = copyWeights(c.weights, o.rate, this.rnd, genome.wMax); weights = r.w; wErrors = r.n; }
    return { id: this.nextId++, genome, weights, errors, wErrors, parent: c.id, born: this.gen + 1 };
  }
  job(child) {
    const c = this.champ, side = this.rnd() < 0.5 ? 0 : 1;   // random sides: no court bias
    const j = { side, seed: (this.seedCounter++ * 2654435761) >>> 0, matchSec: this.opts.matchSec, lamarck: this.opts.lamarck };
    if (side === 0) Object.assign(j, { gA: c.genome, wA: c.weights, gB: child.genome, wB: child.weights });
    else Object.assign(j, { gA: child.genome, wA: child.weights, gB: c.genome, wB: c.weights });
    return j;
  }
  // apply the results of one or more duels, all played against the current champion (parallel arenas).
  // the challenger that won by the largest margin takes the throne. returns the history entries
  record(children, jobs, results) {
    if (!Array.isArray(children)) { children = [children]; jobs = [jobs]; results = [results]; }
    const c = this.champ, out = [];
    let bestK = -1, bestM = -1e9;
    children.forEach((child, k) => {
      const st = results[k].stats, cs = jobs[k].side, ks = 1 - cs, w = winnerOf(st), childWon = w === ks;
      this.gen++;
      c.n++; c.hits += st.hits[cs]; c.balls += st.hits[cs] + st.miss[cs]; c.fit = c.balls ? c.hits / c.balls : 0;
      const e = { gen: this.gen, champHit: st.hitRate[cs], childHit: st.hitRate[ks], rally: st.rally, score: [st.score[cs], st.score[ks]], childWon,
        champId: c.id, childId: child.id, errors: child.errors, wErrors: child.wErrors, hof: !!child.hof, newChamp: false, beneficial: false };
      // dethroning needs a clear win (by 2+ points, or 1 point with a better return rate): a 1-0 fluke keeps the incumbent
      const lead = st.score[ks] - st.score[cs], proven = c.balls >= 30 ? st.hitRate[ks] >= c.fit - 0.05 : true;   // and must play about as well as the champion's long-run record
      const clear = (lead >= 2 || (lead === 1 && st.hitRate[ks] > st.hitRate[cs] + 0.05)) && proven;
      e.clear = childWon && clear;
      if (childWon && clear) { const mg = (st.score[ks] - st.score[cs]) + (st.hitRate[ks] - st.hitRate[cs]); if (mg > bestM) { bestM = mg; bestK = k; } }
      out.push(e);
    });
    if (this.opts.lamarck) { const j = jobs[0]; c.weights = j.side === 0 ? results[0].wA : results[0].wB; }
    if (bestK >= 0) {
      const child = children[bestK], st = results[bestK].stats, ks = 1 - jobs[bestK].side;
      this.toHof(c);
      const nc = { id: child.id, genome: child.genome, weights: this.opts.lamarck ? (ks === 0 ? results[bestK].wA : results[bestK].wB) : null, born: child.born ?? this.gen,
        n: 1, hits: st.hits[ks], balls: st.hits[ks] + st.miss[ks], parent: child.parent, errors: child.errors };
      nc.fit = nc.balls ? nc.hits / nc.balls : 0;
      this.champ = nc; out[bestK].newChamp = true; out[bestK].beneficial = child.errors.length > 0 || child.wErrors > 0;
    }
    for (const e of out) {
      e.champFit = this.champ.fit;
      this.history.push(e); this.log.unshift(e);
    }
    if (this.log.length > 40) this.log.length = 40;
    if (this.champ.n >= 3 && (!this.best || this.champ.fit > this.best.fit)) this.best = { id: this.champ.id, fit: this.champ.fit, gen: this.gen, genome: { ...this.champ.genome } };
    return out;
  }
  toHof(c) {
    if (c.n < 2) return;
    const e = { id: c.id, genome: { ...c.genome }, weights: c.weights, fit: c.fit, n: c.n, born: c.born };
    this.hof = this.hof.filter(h => h.id !== c.id); this.hof.push(e); this.hof.sort((a, b) => b.fit - a.fit); this.hof.length = Math.min(this.hof.length, 5);
  }
  summary() { return { gen: this.gen, champ: { id: this.champ.id, fit: this.champ.fit, n: this.champ.n, born: this.champ.born }, best: this.best && { id: this.best.id, fit: this.best.fit, gen: this.best.gen } }; }
  // compact, JSON-safe snapshot (weights quantised to 8 bits)
  serialize(withWeights = true) {
    const q = c => c && c.weights && withWeights ? quant(c.weights, c.genome.wMax) : null;
    return { v: 1, opts: this.opts, gen: this.gen, seedCounter: this.seedCounter, nextId: this.nextId, best: this.best,
      champ: { ...this.champ, weights: q(this.champ) }, hof: this.hof.map(h => ({ ...h, weights: null })),
      history: this.history.slice(-3000).map(h => ({ ...h, errors: h.errors.slice(0, 6) })) };
  }
  static restore(s) {
    const st = { ...s, champ: { ...s.champ, weights: s.champ.weights ? dequant(s.champ.weights) : null }, log: (s.history || []).slice(-40).reverse() };
    delete st.opts; delete st.v;
    return new Evolution(s.opts, st);
  }
}
// 8-bit weight quantisation for storage (absent synapses = 255)
export function quant(w, wMax) {
  const b = new Uint8Array(w.length); for (let i = 0; i < w.length; i++) b[i] = w[i] < 0 ? 255 : Math.round(Math.min(1, w[i] / wMax) * 254);
  let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return { wMax, b64: btoa(bin) };
}
export function dequant(q) {
  const bin = atob(q.b64), w = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) { const v = bin.charCodeAt(i); w[i] = v === 255 ? -1 : v / 254 * q.wMax; }
  return w;
}
export { GENES, GENE, gen0Genome };
