/* NEURO ARENA: evolution. The reigning champion spawns challengers with copy errors; each pair duels (the show,
   and lifetime learning), then both are scored on a fixed benchmark. The better one keeps (or takes) the throne
   and the loser is replaced by the winner's next spawn. */
import { Brain, mulberry32, PONG_UX, GRID, PLASTIC } from './brain.js';
import { Match, COURT } from './arena.js';
import { GENES, GENE, gen0Genome, copyGenome, copyWeights } from './genome.js';
import { CONTEST, runChoiceDuel, reaper, CURR, levelThr, initGenomeUX, priorAcc, benchSet, probeSet } from './contests.js';
import { mutateUX, classCounts, unitKey, unitClass } from './understand.js';
import { lexNew, lexJob, lexUpdate, lexTests, LEX } from './lexicon.js';
import { wdOf } from './contests.js';
// the contest descriptor the understanding layer uses (Pong has its own)
export const uxC = id => !id || id === 'pong' ? PONG_UX : CONTEST[id];

export const DEFAULTS = { rate: 0.02, matchSec: 30, lamarck: true, contest: 'pong', size: 2800 };
export const TRIAL_LOOP = 3;   // 3: + the understanding layer (genome.ux); choice-contest saves from an older trial loop / layout are not restored
export const STORE_V = 3;   // v3: one evolution per contest (v2 Pong saves are migrated)

/* The standardized benchmark: a fixed set of BENCH_N serves (heights, angles, speeds, distances) that every
   brain faces in the same order (common random numbers). Plasticity is frozen while it is measured, so a
   brain's score is a deterministic function of its genome and synapses: champion and challenger are compared
   on exactly the same balls. */
export const BENCH_N = 50, BENCH_SEED = 4242;
export const BENCH = (() => { const r = mulberry32(BENCH_SEED); return Array.from({ length: BENCH_N }, () => ({ x: COURT.W * (0.35 + 0.55 * r()), y: 0.1 + 0.8 * r(), a: (r() - 0.5) * 1.5, sp: COURT.v0 * (1 + 0.5 * r()) })); })();
/* With the evolved understanding layer (genome.ux) the benchmark also scores AIM: after a return, play on until the
   tracking opponent answers; if it misses, the return was a WINNER (vec digit 2, +1 extra point). */
export function benchmark(genome, weights, serves = BENCH, player = null, opts = {}) {
  const b = player ? null : new Brain({ ...genome, eta: 0, homeo: 0 }, weights, opts), aim = !!opts.aim;
  const m = new Match([player || { brain: b }, opts.enemy || { track: true }], mulberry32(77)), pg = m.pong;
  let ev = null, ev1 = null; m.onEvent = e => { if (e.p === 0) ev = e; else ev1 = e; };
  const vec = new Uint8Array(serves.length); let hits = 0, wins = 0;
  serves.forEach((s, i) => {
    pg.bx = s.x; pg.by = s.y; pg.vx = -s.sp * Math.cos(s.a); pg.vy = s.sp * Math.sin(s.a); pg.wait = 120; ev = null; ev1 = null;
    if (opts.enemyY) { pg.pad[1] = opts.enemyY(i); opts.enemy.fixed = pg.pad[1]; }
    const t0 = m.t; while (!ev && m.t - t0 < 5000) m.stepMs(1);
    if (ev && ev.t === 'hit') { vec[i] = 1; hits++;
      if (aim) { const t1 = m.t; while (!ev1 && m.t - t1 < 5000) m.stepMs(1); if (ev1 && ev1.t === 'miss') { vec[i] = 2; wins++; } } }
  });
  // Reaper fields: a returned serve is a correct answer, a missed one an incorrect answer (Pong has no abstaining)
  const n = serves.length;
  return { hit: hits / n, hits, n, vec: Array.from(vec).join(''), fit: hits / n, score: hits + wins, correct: hits, wrong: n - hits, abstain: 0, max: aim ? 2 * n : n, acc: hits / n, lat: null, wins: aim ? wins : undefined, winRate: aim ? wins / n : undefined };
}
/* Pong's Understanding probe: 40 serves to the brain while the enemy is a statue sitting HIGH (odd serves: LOW).
   Tracking returns the ball near the middle, where the statue often blocks it; a brain that knows its enemy aims
   for the open side. acc = share of serves won outright; openSide = share of returns that beat the statue. */
export const PROBE_P = BENCH.slice(0, 40);
export function pongProbe(genome, weights, opts = {}, player = null) {
  const enemy = { fixed: 0.8 }, r = benchmark(genome, weights, PROBE_P, player, { ...opts, aim: true, enemy, enemyY: i => i % 2 ? 0.2 : 0.8 });
  return { acc: r.wins / r.n, n: r.n, hits: r.hits, won: r.wins, openSide: r.hits ? r.wins / r.hits : 0, hit: r.hit };
}
let PRIOR_P = null;
export const pongPrior = () => PRIOR_P || (PRIOR_P = { probe: pongProbe(null, null, {}, { track: true }), bench: benchmark(null, null, BENCH, { track: true }, { aim: true }) });
export function pongUnderstanding(g, w, ablate = false) {
  const pr = pongPrior(), p = pongProbe(g, w), out = { acc: p.acc, n: p.n, prior: pr.probe.acc, openSide: p.openSide, hit: p.hit, fullPrior: pr.probe.openSide };
  if (ablate && g.ux) { const cls = g.ux.units.map(u => unitClass(PONG_UX, u)), kos = { 'none': () => false, 'all units': () => true, 'self': u => cls[u] === 'self', 'enemy': u => cls[u] === 'enemy', 'self+enemy': u => cls[u] === 'self' || cls[u] === 'enemy', 'reflex': u => cls[u] === 'reflex' };
    out.ablate = {}; for (const [k, f] of Object.entries(kos)) { const o = { silence: f }, q = pongProbe(g, w, o), b = benchmark(g, w, BENCH, null, o); out.ablate[k] = { probe: q.acc, full: b.hit, win: b.winRate }; }
    out.units = g.ux.units; out.readout = new Brain({ ...g, eta: 0 }, w).unitReadout(); }
  return out;
}
// paired comparison on the same serves: b = serves only the challenger returned, c = only the champion
export function paired(vc, vk) { let b = 0, c = 0; for (let i = 0; i < vc.length; i++) { if (vk[i] === '1' && vc[i] !== '1') b++; if (vc[i] === '1' && vk[i] !== '1') c++; } return { b, c }; }
// a challenger must beat the champion by >= 2 serves AND the paired sign test must favour it (b - c >= sqrt(b + c))
export function clearlyBetter(champ, child) { const { b, c } = paired(champ.vec, child.vec); return b - c >= Math.max(2, Math.sqrt(b + c)); }

// run one complete duel headlessly, then benchmark both brains with their post-duel synapses.
// gA/gB genomes, wA/wB dense weights or null
export function runDuel(job) {
  if (job.contest && job.contest !== 'pong') return runChoiceDuel(job);
  const A = new Brain(job.gA, job.wA), B = new Brain(job.gB, job.wB), mo = { aimR: job.aimR || 0 };
  // understanding fix, static-opponent curriculum: each brain first practises against a statue (height changes every
  // 10 s) for half the duel time, learning where returns beat a parked paddle; then the real duel
  if (job.statue) for (const X of [A, B]) { const st = { fixed: 0.8 }, ms = new Match([{ brain: X }, st], mulberry32(job.seed ^ 0x5eed), mo), r = mulberry32(job.seed + 7);
    for (let t = 0; t < job.matchSec / 2; t += 10) { st.fixed = 0.15 + 0.7 * r(); ms.stepMs(10000); } }
  const m = new Match([{ brain: A }, { brain: B }], mulberry32(job.seed), mo);
  m.stepMs(Math.round(job.matchSec * 1000));
  const st = m.stats(), wA = A.exportWeights(), wB = B.exportWeights();
  const bench = job.bench === false ? null : [benchmark(job.gA, wA), benchmark(job.gB, wB)];
  const cg = job.side === 0 ? job.gA : job.gB, up = job.uprobe && cg.ux ? pongUnderstanding(cg, job.side === 0 ? wA : wB, job.ablate) : null;
  return { id: job.id, stats: st, wA: job.lamarck ? wA : null, wB: job.lamarck ? wB : null, bench, up, aim: [m.aim[0], m.aim[1]] };
}
export const winnerOf = st => st.score[0] !== st.score[1] ? (st.score[0] > st.score[1] ? 0 : 1) : st.hitRate[0] !== st.hitRate[1] ? (st.hitRate[0] > st.hitRate[1] ? 0 : 1) : 0;

export class Evolution {
  constructor(opts = {}, state = null) {
    this.opts = { ...DEFAULTS, ...opts };
    if (state) { Object.assign(this, state); this.rnd = mulberry32((this.seedCounter = (this.seedCounter || 1) + 1) * 977); this.lexInit(); return; }
    this.gen = 0; this.seedCounter = 1; this.nextId = 2;
    this.champ = { id: 1, genome: initGenomeUX(uxC(this.opts.contest), gen0Genome(), this.opts.reflex ?? 1, this.opts.uxSeed), weights: null, born: 0, n: 0, fit: 0, bench: null, scores: [] };
    if (this.opts.wiring === 'designed') delete this.champ.genome.ux;
    this.history = []; this.hof = []; this.log = []; this.best = null;
    this.rnd = mulberry32(12345); this.lexInit();
  }
  // Word completion: the growing lexicon (lexicon.js); a save from before it starts one at its current level
  lexInit() { const C = CONTEST[this.opts.contest]; if (C && C.lex && !this.lex) { this.lex = lexNew(this.level || 0); if (this.opts.lexicon === 'static') this.lex.static = true; } this._lj = null; }   // 'static' = the old fixed list (counted and tested, never grown: the control condition)
  // make a challenger from the champion (or a Hall-of-Fame rematch)
  spawn() {
    const o = this.opts, c = this.champ;
    const hof = this.hof[0];
    if (hof && this.gen - (this.lastRM || 0) >= 25 && c.n >= 3 && hof.fit > c.fit + 0.06 && hof.id !== c.id && (hof.weights || !o.lamarck) && (this.lastRM = this.gen) >= 0)
      return { id: hof.id, genome: { ...hof.genome }, weights: hof.weights && o.lamarck ? cloneW(hof.weights) : null, errors: [], wErrors: 0, parent: c.id, hof: true, born: hof.born };
    const { genome, errors } = copyGenome(c.genome, o.rate, this.rnd);   // copy errors go into the CHILD's copy only
    if (c.genome.ux) genome.ux = mutateUX(uxC(o.contest), c.genome.ux, o.rate * (o.uxRate || 1), this.rnd, errors);   // the understanding layer's wiring
    let weights = null, wErrors = 0;
    if (o.lamarck && c.weights) { const isObj = !!c.weights.W, r = copyWeights(isObj ? c.weights.W : c.weights, o.rate, this.rnd, genome.wMax); weights = isObj ? { ...c.weights, W: r.w } : r.w; wErrors = r.n;
      // Pong: a rewired unit starts with fresh synapses (NaN = 'initialise' for Brain.initPlastic)
      if (!isObj && genome.ux) { const NM = PLASTIC.NM, a0 = GRID.GF[0] * GRID.GF[1]; genome.ux.units.forEach((u, k) => { if (unitKey(u) !== unitKey(c.genome.ux.units[k])) for (let x = 0; x < 2; x++) { const a = a0 + 2 * k + x; for (let m = 0; m < NM; m++) if (weights[a * NM + m] >= 0) weights[a * NM + m] = NaN; } }); } }
    return { id: this.nextId++, genome, weights, errors, wErrors, parent: c.id, born: this.gen + 1 };
  }
  job(child) {
    const c = this.champ, side = this.rnd() < 0.5 ? 0 : 1;   // random sides: no court bias
    const j = { side, seed: (this.seedCounter++ * 2654435761) >>> 0, matchSec: this.opts.matchSec, lamarck: this.opts.lamarck, contest: this.opts.contest || 'pong', size: this.opts.size || 2800, level: this.level || 0, nbrStage: !!this.opts.nbrStage && this.gen < (this.opts.nbrGens || 1e9), probeMix: !!this.opts.probeMix, aimR: this.opts.aimR || 0, statue: !!this.opts.statue && this.gen < (this.opts.statueGens || 1e9) };
    // every 10 generations (and right after a new champion or a level-up) one duel also benchmarks the champion on the
    // full task (the last curriculum level), so the chart can show real progress across level changes
    const C = CONTEST[j.contest], last = C && C.levels ? C.levels.length - 1 : 0;
    if (C && C.levels && j.level < last && this.gen - (this.lastProbe ?? -99) >= 10) { this.lastProbe = this.gen; j.probe = last; }
    // the Understanding probe every 10 generations (ablations every 100) on the champion's synapses
    if (((C && C.probe) || ((!C || C.kind !== 'choice') && c.genome.ux)) && this.gen - (this.lastUP ?? -99) >= 10) { this.lastUP = this.gen; j.uprobe = true; if (c.genome.ux && this.gen - (this.lastAbl ?? -999) >= 100) { this.lastAbl = this.gen; j.ablate = true; } }
    if (this.lex) { if (!this.lex.static) j.lex = this._lj || (this._lj = lexJob(this.lex));
      if (this.gen - (this.lastLexT ?? -99) >= LEX.testEvery) { this.lastLexT = this.gen; j.lexT = lexTests(this.lex, j.level); } }
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
    // curriculum: when the champion passes levelThr (C.currThr[level], else CURR.thr) on the current level's frozen benchmark, the next generation
    // trains and is judged on the next level (the old benchmark score no longer applies, so it is re-earned)
    const C = CONTEST[o.contest];
    const lv0 = this.level || 0;   // the level these duels were played and benchmarked at
    const pr = results.find(r => r && r.probe); if (pr) this.fullAcc = pr.probe.acc;
    const ur = results.find(r => r && r.up); if (ur) { this.uAcc = ur.up.acc; this.uOpen = ur.up.openSide ?? null; this.uHit = ur.up.hit ?? null; if (ur.up.ablate) { this.uAbl = { gen: this.gen, ...ur.up.ablate }; this.uRead = { gen: this.gen, units: ur.up.units, readout: ur.up.readout }; } }
    if (out.some(e => e.newChamp)) this.lastProbe = -99;
    // growing lexicon: fold in the per-word counts, retire, admit (one cycle per batch of generations)
    let lc = null;
    if (this.lex) { const wds = results.map((r, k) => r && (r.wd || (r.stats && r.stats.wd ? wdOf(r.stats.wd, jobs[k].side) : null)));
      lc = lexUpdate(this.lex, wds, lv0, this.gen, children.length); this._lj = null;
      const lt = results.find(r => r && r.lexT); if (lt) this.lexAcc = { gen: this.gen, ...lt.lexT }; }
    if (C && C.levels && this.champ.bench && (this.champ.bench.level ?? 0) === (this.level || 0) && this.champ.bench.acc >= levelThr(C, this.level || 0) && (this.level || 0) < C.levels.length - 1) {
      const passed = this.champ.bench.acc;
      this.level = (this.level || 0) + 1; this.champ.bench = null; this.champ.fit = 0; this.champ.scores = []; this.lastProbe = -99; this.bestAcc = 0;   // 'best ever' is per level
      const last = out[out.length - 1]; if (last) { last.levelUp = this.level; last.passed = passed; }
      (this.levelUps = this.levelUps || []).push({ gen: this.gen, level: this.level });
    }
    for (const e of out) { if (lc) { e.lexAct = lc.act; e.lexSeen = lc.seen; e.lexRet = lc.ret; e.newAcc = this.lexAcc ? this.lexAcc.newAcc : null; e.famAcc = this.lexAcc ? this.lexAcc.famAcc : null; }
      e.level = lv0; if (C && C.levels) e.fullAcc = lv0 === C.levels.length - 1 ? e.champAccNow : this.fullAcc ?? null;
      // understanding metrics: probe accuracy, beyond-reflex (full-task accuracy minus the reflex's guess on the same items), layer census
      if (C && C.probe) { e.uAcc = this.uAcc ?? null; const fa = C.levels ? e.fullAcc : e.champAccNow; e.beyond = fa != null ? fa - priorAcc(C, benchSet(C, C.levels ? C.levels.length - 1 : 0)) : null; }
      // Pong: probe = serves won outright against the statue; beyond-reflex = how much more often a return beats the
      // statue than a perfect tracker's returns do (aim quality, independent of how often the brain hits at all)
      if ((!C || C.kind !== 'choice') && this.champ.genome.ux) { e.uAcc = this.uAcc ?? null; e.openSide = this.uOpen ?? null; e.uHit = this.uHit ?? null; e.beyond = this.uOpen != null ? this.uOpen - pongPrior().probe.openSide : null;
        const ai = results.map((r, k) => r && r.aim && r.aim[jobs[k].side]).filter(Boolean), ret = ai.reduce((a, x) => a + x.ret, 0); e.duelWinners = ret ? ai.reduce((a, x) => a + x.won, 0) / ret : null; }
      if (this.champ.genome.ux) e.cls = classCounts(uxC(o.contest), this.champ.genome.ux); }
    if (lc && out.length) { const e = out[out.length - 1]; Object.assign(e, { lexNew: lc.newN, lexRetN: lc.retN, lexRep: lc.rep, freshAcc: lc.fresh, famLive: lc.fam }); }
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
    return { v: STORE_V, tl: TRIAL_LOOP, opts: this.opts, gen: this.gen, lastRM: this.lastRM || 0, seedCounter: this.seedCounter, nextId: this.nextId, best: this.best,
      lex: this.lex || null, lexAcc: this.lexAcc || null, lastLexT: this.lastLexT ?? -99, bestAcc: this.bestAcc || 0, fullAcc: this.fullAcc ?? null, uAcc: this.uAcc ?? null, uOpen: this.uOpen ?? null, uHit: this.uHit ?? null, uAbl: this.uAbl || null, uRead: this.uRead || null, lastUP: this.lastUP ?? -99, lastAbl: this.lastAbl ?? -999, level: this.level || 0, levelUps: this.levelUps || [], lab: (this.lab || []).slice(-1500), champ: { ...this.champ, weights: q(this.champ) }, hof: this.hof.map((h, k) => ({ ...h, weights: k < 2 ? q(h) : null })),
      history: this.history.slice(-3000).map(h => ({ ...h, errors: h.errors.slice(0, 6), seg: h.seg && h.seg.slice(0, 12) })) };
  }
  static restore(s) {
    if (!s || (s.v !== STORE_V && s.v !== 2)) return null;
    if (s.opts && s.opts.contest && s.opts.contest !== 'pong' && s.tl !== TRIAL_LOOP) return null;   // choice brains from before the explicit trial loop / curriculum: start fresh   // v2 = a Pong-only save of the same format   // older saves came from the buggy learner: start fresh
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
export function quantW(w, wMax) { return w.W ? { meta: { seed: w.seed, pAM: w.pAM, size: w.size, K: w.K, rBar: w.rBar, uk: w.uk }, q: quant(w.W, wMax) } : quant(w, wMax); }
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
