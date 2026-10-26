/* NEURO ARENA: evolution. The reigning champion spawns challengers with copy errors; each pair duels (the show,
   and lifetime learning), then both are scored on a fixed benchmark. The better one keeps (or takes) the throne
   and the loser is replaced by the winner's next spawn. */
import { Brain, mulberry32 } from './brain.js';
import { Match, COURT } from './arena.js';
import { GENES, GENE, gen0Genome, copyGenome, copyWeights } from './genome.js';
import { CONTEST, runChoiceDuel, reaper } from './contests.js';

export const DEFAULTS = { rate: 0.02, matchSec: 30, lamarck: true, contest: 'pong', size: 2800 };
export const STORE_V = 3;   // v3: one evolution per contest (v2 Pong saves are migrated)

/* The standardized benchmark: a fixed set of BENCH_N serves (heights, angles, speeds, distances) that every
   brain faces in the same order (common random numbers). Plasticity is frozen while it is measured, so a
   brain's score is a deterministic function of its genome and synapses: champion and challenger are compared
   on exactly the same balls. */
export const BENCH_N = 50, BENCH_SEED = 4242;
export const BENCH = (() => { const r = mulberry32(BENCH_SEED); return Array.from({ length: BENCH_N }, () => ({ x: COURT.W * (0.35 + 0.55 * r()), y: 0.1 + 0.8 * r(), a: (r() - 0.5) * 1.5, sp: COURT.v0 * (1 + 0.5 * r()) })); })();
export function benchmark(genome, weights, serves = BENCH, player = null) {
  const b = player ? null : new Brain({ ...genome, eta: 0, homeo: 0 }, weights);
  const m = new Match([player || { brain: b }, { track: true }], mulberry32(77)), pg = m.pong;
  let ev = null; m.onEvent = e => { if (e.p === 0) ev = e; };
  const vec = new Uint8Array(serves.length); let hits = 0;
  serves.forEach((s, i) => {
    pg.bx = s.x; pg.by = s.y; pg.vx = -s.sp * Math.cos(s.a); pg.vy = s.sp * Math.sin(s.a); pg.wait = 120; ev = null;
    const t0 = m.t; while (!ev && m.t - t0 < 5000) m.stepMs(1);
    if (ev && ev.t === 'hit') { vec[i] = 1; hits++; }
  });
  // Reaper fields: a returned serve is a correct answer, a missed one an incorrect answer (Pong has no abstaining)
  return { hit: hits / serves.length, hits, n: serves.length, vec: Array.from(vec).join(''), fit: hits / serves.length, score: hits, correct: hits, wrong: serves.length - hits, abstain: 0, max: serves.length, acc: hits / serves.length, lat: null };
}
// paired comparison on the same serves: b = serves only the challenger returned, c = only the champion
export function paired(vc, vk) { let b = 0, c = 0; for (let i = 0; i < vc.length; i++) { if (vk[i] === '1' && vc[i] !== '1') b++; if (vc[i] === '1' && vk[i] !== '1') c++; } return { b, c }; }
// a challenger must beat the champion by >= 2 serves AND the paired sign test must favour it (b - c >= sqrt(b + c))
export function clearlyBetter(champ, child) { const { b, c } = paired(champ.vec, child.vec); return b - c >= Math.max(2, Math.sqrt(b + c)); }

// run one complete duel headlessly, then benchmark both brains with their post-duel synapses.
// gA/gB genomes, wA/wB dense weights or null
export function runDuel(job) {
  if (job.contest && job.contest !== 'pong') return runChoiceDuel(job);
  const A = new Brain(job.gA, job.wA), B = new Brain(job.gB, job.wB);
  const m = new Match([{ brain: A }, { brain: B }], mulberry32(job.seed));
  m.stepMs(Math.round(job.matchSec * 1000));
  const st = m.stats(), wA = A.exportWeights(), wB = B.exportWeights();
  const bench = job.bench === false ? null : [benchmark(job.gA, wA), benchmark(job.gB, wB)];
  return { id: job.id, stats: st, wA: job.lamarck ? wA : null, wB: job.lamarck ? wB : null, bench };
}
export const winnerOf = st => st.score[0] !== st.score[1] ? (st.score[0] > st.score[1] ? 0 : 1) : st.hitRate[0] !== st.hitRate[1] ? (st.hitRate[0] > st.hitRate[1] ? 0 : 1) : 0;

export class Evolution {
  constructor(opts = {}, state = null) {
    this.opts = { ...DEFAULTS, ...opts };
    if (state) { Object.assign(this, state); this.rnd = mulberry32((this.seedCounter = (this.seedCounter || 1) + 1) * 977); return; }
    this.gen = 0; this.seedCounter = 1; this.nextId = 2;
    this.champ = { id: 1, genome: gen0Genome(), weights: null, born: 0, n: 0, fit: 0, bench: null, scores: [] };
    this.history = []; this.hof = []; this.log = []; this.best = null;
    this.rnd = mulberry32(12345);
  }
  // make a challenger from the champion (or a Hall-of-Fame rematch)
  spawn() {
    const o = this.opts, c = this.champ;
    const hof = this.hof[0];
    if (hof && this.gen - (this.lastRM || 0) >= 25 && c.n >= 3 && hof.fit > c.fit + 0.06 && hof.id !== c.id && (hof.weights || !o.lamarck) && (this.lastRM = this.gen) >= 0)
      return { id: hof.id, genome: { ...hof.genome }, weights: hof.weights && o.lamarck ? cloneW(hof.weights) : null, errors: [], wErrors: 0, parent: c.id, hof: true, born: hof.born };
    const { genome, errors } = copyGenome(c.genome, o.rate, this.rnd);   // copy errors go into the CHILD's copy only
    let weights = null, wErrors = 0;
    if (o.lamarck && c.weights) { const isObj = !!c.weights.W, r = copyWeights(isObj ? c.weights.W : c.weights, o.rate, this.rnd, genome.wMax); weights = isObj ? { ...c.weights, W: r.w } : r.w; wErrors = r.n; }
    return { id: this.nextId++, genome, weights, errors, wErrors, parent: c.id, born: this.gen + 1 };
  }
  job(child) {
    const c = this.champ, side = this.rnd() < 0.5 ? 0 : 1;   // random sides: no court bias
    const j = { side, seed: (this.seedCounter++ * 2654435761) >>> 0, matchSec: this.opts.matchSec, lamarck: this.opts.lamarck, contest: this.opts.contest || 'pong', size: this.opts.size || 2800 };
    if (side === 0) Object.assign(j, { gA: c.genome, wA: c.weights, gB: child.genome, wB: child.weights });
    else Object.assign(j, { gA: child.genome, wA: child.weights, gB: c.genome, wB: c.weights });
    return j;
  }
  /* apply the results of one or more duels, all played against the current champion (parallel arenas).
     Selection uses the benchmark, not the duel score:
     - the champion itself trained in every duel; its best benchmarked copy is kept, but in Lamarckian mode only
       if it beats the synapses it already had (elitism: the champion's score never goes down);
     - in Darwinian mode the champion relearns from its genes every duel, so its fitness is the running mean
       of its benchmark scores (re-evaluated every round);
     - a challenger takes the throne only if it is clearly better on the same serves; the best such challenger wins.
     returns the history entries */
  record(children, jobs, results) {
    if (!Array.isArray(children)) { children = [children]; jobs = [jobs]; results = [results]; }
    const o = this.opts, c = this.champ, out = [], prevBench = c.bench ? c.fit : null;
    // 1. the champion's own lifetime learning
    let ref = c.bench && o.lamarck ? { bench: c.bench, w: c.weights } : null;
    children.forEach((child, k) => {
      const cs = jobs[k].side, b = results[k].bench[cs];
      c.scores = (c.scores || []).concat(F(b)).slice(-8);
      if (o.lamarck && (!ref || S(b) > S(ref.bench))) ref = { bench: b, w: cs === 0 ? results[k].wA : results[k].wB };
      if (!o.lamarck && (!ref || S(b) > S(ref.bench))) ref = { bench: b, w: null };
    });
    c.n++;
    if (o.lamarck) { c.weights = ref.w; c.bench = ref.bench; c.fit = F(ref.bench); }
    else { c.bench = ref.bench; c.weights = null; c.fit = c.scores.reduce((a, x) => a + x, 0) / c.scores.length; }
    // 2. challengers
    let bestK = -1, bestH = -Infinity;
    children.forEach((child, k) => {
      const st = results[k].stats, cs = jobs[k].side, ks = 1 - cs, bk = results[k].bench[ks], bc = results[k].bench[cs];
      this.gen++;
      // Lamarckian: compare with the champion's kept synapses (deterministic score); Darwinian: with the champion copy in the same duel
      const cmp = o.lamarck ? c.bench : bc;
      // Darwinian lifetimes are stochastic: picking the luckiest of K lives would crown noise, so also demand a 3-serve margin over the champion's mean
      const v = reaper(cmp, bk, o.contest || 'pong');
      const clear = v.reaped && (o.lamarck || F(bk) >= c.fit + 0.06);
      v.reaped = clear; v.champId = c.id; v.childId = child.id;
      const e = { gen: this.gen, champBench: c.fit, childBench: F(bk), reaper: v, contest: o.contest || 'pong', childAcc: bk.acc, champAcc: cmp.acc, champHit: st.hitRate[cs], childHit: st.hitRate[ks], rally: st.rally, score: [st.score[cs], st.score[ks]],
        childWon: winnerOf(st) === ks, clear, champId: c.id, childId: child.id, errors: child.errors, wErrors: child.wErrors, hof: !!child.hof, newChamp: false, beneficial: false, seg: st.seg, cs, prevBench };
      if (clear && S(bk) > bestH) { bestH = S(bk); bestK = k; }
      out.push(e);
    });
    if (bestK >= 0) {
      const child = children[bestK], ks = 1 - jobs[bestK].side, bk = results[bestK].bench[ks];
      this.toHof(c);
      const nc = { id: child.id, genome: child.genome, weights: o.lamarck ? (ks === 0 ? results[bestK].wA : results[bestK].wB) : null, born: child.born ?? this.gen,
        n: 0, bench: bk, fit: F(bk), scores: [F(bk)], parent: child.parent, errors: child.errors };
      this.champ = nc; out[bestK].newChamp = true; out[bestK].beneficial = child.errors.length > 0 || child.wErrors > 0;
    }
    if (!this.best || this.champ.fit > this.best.fit) this.best = { id: this.champ.id, fit: this.champ.fit, gen: this.gen, genome: { ...this.champ.genome } };
    for (const e of out) {
      e.champFit = this.champ.fit; e.bestFit = this.best.fit; e.lam = !!o.lamarck;
      e.champAccNow = this.champ.bench ? (this.champ.bench.acc ?? this.champ.fit) : 0; e.bestAcc = Math.max(e.champAccNow, this.bestAcc || 0); this.bestAcc = e.bestAcc;
      this.history.push(e); this.log.unshift(e);
    }
    if (this.log.length > 40) this.log.length = 40;
    return out;
  }
  toHof(c) {
    if (c.n < 1) return;
    const e = { id: c.id, genome: { ...c.genome }, weights: c.weights, bench: c.bench, fit: c.fit, n: c.n, born: c.born };
    this.hof = this.hof.filter(h => h.id !== c.id); this.hof.push(e); this.hof.sort((a, b) => b.fit - a.fit); this.hof.length = Math.min(this.hof.length, 5);
  }
  summary() { return { gen: this.gen, champ: { id: this.champ.id, fit: this.champ.fit, n: this.champ.n, born: this.champ.born }, best: this.best && { id: this.best.id, fit: this.best.fit, gen: this.best.gen } }; }
  // compact, JSON-safe snapshot (weights quantised to 8 bits; the synapses of the top 2 Hall-of-Fame entries are kept
  // too, so they can still be re-challenged in Lamarckian mode after a reload)
  serialize(withWeights = true) {
    const q = c => c && c.weights && withWeights ? quantW(c.weights, c.genome.wMax) : null;
    return { v: STORE_V, opts: this.opts, gen: this.gen, lastRM: this.lastRM || 0, seedCounter: this.seedCounter, nextId: this.nextId, best: this.best,
      bestAcc: this.bestAcc || 0, lab: (this.lab || []).slice(-1500), champ: { ...this.champ, weights: q(this.champ) }, hof: this.hof.map((h, k) => ({ ...h, weights: k < 2 ? q(h) : null })),
      history: this.history.slice(-3000).map(h => ({ ...h, errors: h.errors.slice(0, 6), seg: h.seg && h.seg.slice(0, 12) })) };
  }
  static restore(s) {
    if (!s || (s.v !== STORE_V && s.v !== 2)) return null;   // v2 = a Pong-only save of the same format   // older saves came from the buggy learner: start fresh
    const st = { ...s, champ: { ...s.champ, weights: s.champ.weights ? dequantW(s.champ.weights) : null }, log: (s.history || []).slice(-40).reverse(),
      hof: (s.hof || []).map(h => ({ ...h, weights: h.weights ? dequantW(h.weights) : null })) };
    // weights lost in storage (quota): the stored benchmark no longer describes the champion, so re-earn it
    if (s.opts.lamarck && !st.champ.weights && s.champ.bench) { st.champ.bench = null; st.champ.fit = 0; }
    delete st.opts; delete st.v;
    return new Evolution(s.opts, st);
  }
}
const S = b => b.score ?? b.hits, F = b => b.fit ?? b.hit;
const cloneW = w => w.W ? { ...w, W: new Float32Array(w.W) } : new Float32Array(w);
// choice-brain weights are { W, seed, pAM, size, K }: quantise W, keep the metadata
export function quantW(w, wMax) { return w.W ? { meta: { seed: w.seed, pAM: w.pAM, size: w.size, K: w.K }, q: quant(w.W, wMax) } : quant(w, wMax); }
export function dequantW(q) { return q.meta ? { ...q.meta, W: dequant(q.q) } : dequant(q); }
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
