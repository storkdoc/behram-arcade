/* NEURO ARENA: the contests on the carousel, THE REAPER (the judge), and the trial runner for choice brains.
   Every non-Pong contest is a short-horizon two-player quiz: both brains see the same stimulus at the same moment
   and race to answer by making one of their choice populations win. Answers are strings (e.g. "12", "T") and are
   judged per character. */
import { mulberry32 } from './brain.js';
import { ChoiceBrain } from './cbrain.js';

const D = n => Array.from({ length: n }, (_, k) => String(k));
const pick = (r, a) => a[Math.floor(r() * a.length)];
const WORDS = ['CAT', 'DOG', 'SUN', 'PIG', 'BEE', 'OWL', 'FOX', 'COW', 'HEN', 'RAT', 'BUS', 'CUP', 'HAT', 'MAP', 'JAM', 'BOX'];
const W1 = [...new Set(WORDS.map(w => w[0]))].sort(), W2 = [...new Set(WORDS.map(w => w[1]))].sort(), W3 = [...new Set(WORDS.map(w => w[2]))].sort();

/* a contest: K answers (labels), two input slots with n[c] symbols (sym[c] names them for the display),
   all(): every distinct item [x0, x1, answerIndex, display]; items are drawn uniformly from all() */
export const CONTESTS = [
  { id: 'pong', name: 'Pong', icon: '🏓', kind: 'pong', blurb: 'Return the ball. A miss gives the other brain the point.' },
  { id: 'add', name: 'Addition', icon: '➕', kind: 'choice', blurb: 'a + b with a, b in 0..4: answer 0..8.',
    n: [5, 5], labels: D(9), rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) o.push([a, b, a + b, `${a} + ${b} = ?`]); return o; } },
  { id: 'add7', name: 'Addition to 12', icon: '➕', kind: 'choice', hidden: true, blurb: 'a + b with a, b in 0..6: answer 0..12 (two-digit answers are judged per digit).',
    n: [7, 7], labels: D(13), rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) o.push([a, b, a + b, `${a} + ${b} = ?`]); return o; } },
  { id: 'add5', name: 'Addition (small)', icon: '➕', kind: 'choice', hidden: true, blurb: 'a + b with a, b in 1..5: answer 2..10.',
    n: [5, 5], labels: ['2', '3', '4', '5', '6', '7', '8', '9', '10'], rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) o.push([a - 1, b - 1, a + b - 2, `${a} + ${b} = ?`]); return o; } },
  { id: 'sub', name: 'Subtraction', icon: '➖', kind: 'choice', blurb: 'a − b with 0 ≤ b ≤ a ≤ 5: answer 0..5.',
    n: [6, 6], labels: D(6), rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 0; a < 6; a++) for (let b = 0; b <= a; b++) o.push([a, b, a - b, `${a} − ${b} = ?`]); return o; } },
  { id: 'sub9', name: 'Subtraction to 8', icon: '➖', kind: 'choice', hidden: true, blurb: 'a − b with 0 ≤ b ≤ a ≤ 8: answer 0..8.',
    n: [9, 9], labels: D(9), rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 0; a < 9; a++) for (let b = 0; b <= a; b++) o.push([a, b, a - b, `${a} − ${b} = ?`]); return o; } },
  { id: 'big', name: 'Bigger number', icon: '⚖️', kind: 'choice', blurb: 'Which side holds the bigger digit? Answer L or R.',
    n: [10, 10], labels: ['L', 'R'], rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (a !== b) o.push([a, b, a > b ? 0 : 1, `${a}  vs  ${b}`]); return o; } },
  { id: 'parity', name: 'Even or odd', icon: '🎲', kind: 'choice', blurb: 'Rapid fire: is the number even (E) or odd (O)?',
    n: [10, 10], labels: ['E', 'O'], rf: [0.35, 0.35],   // the digit is shown to both input slots (a one-symbol slot over-drives the grid)
    all: () => D(10).map((_, a) => [a, a, a % 2, `${a}`]) },
  { id: 'text', name: 'Text completion', icon: '🔤', kind: 'choice', blurb: `Complete the word: CA_ → T. Vocabulary: ${WORDS.join(' ')}.`,
    n: [W1.length, W2.length], labels: W3, sym: [W1, W2], rf: [0.35, 0.35],
    all: () => WORDS.map(w => [W1.indexOf(w[0]), W2.indexOf(w[1]), W3.indexOf(w[2]), `${w[0]}${w[1]}_`, w]) },
  { id: 'rps', name: 'Rock paper scissors', icon: '✊', kind: 'choice', blurb: 'Your opponent throws a move: answer the move that beats it (R beats S, P beats R, S beats P).',
    n: [3, 3], labels: ['R', 'P', 'S'], rf: [0.35, 0.35],
    all: () => [[0, 0, 1, 'they throw ✊ R'], [1, 1, 2, 'they throw ✋ P'], [2, 2, 0, 'they throw ✌️ S']] },
  { id: 'echo', name: 'Echo', icon: '🔁', kind: 'choice', blurb: 'A letter flashes: echo it back.',
    n: [8, 8], labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], rf: [0.35, 0.35],
    all: () => 'ABCDEFGH'.split('').map((l, i) => [i, i, i, l]) },
  { id: 'dots', name: 'Count the dots', icon: '⚫', kind: 'choice', blurb: 'How many dots? Answer 1..6.',
    n: [6, 6], labels: ['1', '2', '3', '4', '5', '6'], rf: [0.35, 0.35],
    all: () => [0, 1, 2, 3, 4, 5].map(i => [i, i, i, '●'.repeat(i + 1).split('').join(' ')]) },
  { id: 'pattern', name: 'Pattern completion', icon: '🧩', kind: 'choice', blurb: 'Continue the sequence: a, a+d, a+2d, ? with a in 0..4, d in 0..1.',
    n: [5, 2], labels: D(8), rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 0; a < 5; a++) for (let d = 0; d < 2; d++) o.push([a, d, a + 3 * d, `${a}, ${a + d}, ${a + 2 * d}, ?`]); return o; } },
  { id: 'simon', name: 'Simon', icon: '🚦', kind: 'choice', blurb: 'Two colours flash in order: repeat the sequence (scored per colour, so half right still earns a point).',
    n: [3, 3], labels: ['RR', 'RG', 'RB', 'GR', 'GG', 'GB', 'BR', 'BG', 'BB'], rf: [0.35, 0.35],
    all: () => { const o = [], L = 'RGB', E = { R: '🔴', G: '🟢', B: '🔵' }; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) o.push([a, b, a * 3 + b, `${E[L[a]]} then ${E[L[b]]}`]); return o; } },
  { id: 'tug', name: 'Tug-of-war reflex', icon: '🪢', kind: 'choice', hidden: true, blurb: 'An arrow flashes; the first brain to pull the right way moves the rope.',
    n: [2, 1], labels: ['◀', '▶'], rf: [0.3, 0.35], race: true,
    all: () => [[0, 0, 0, '◀'], [1, 0, 1, '▶']] },
];
export const CONTEST = Object.fromEntries(CONTESTS.map(c => [c.id, c]));
for (const c of CONTESTS) if (c.kind === 'choice') { c.K = c.labels.length; c.items = c.all(); c.chance = 1 / c.K; }

export const TRIAL = { maxMs: 260, minMs: 25, iti: 80, commitMs: 40, commitI: 3 };
// decision margin (spikes the leading population must be ahead by) from the decoder-gain gene
export const DEC = { k: 1 };
// the count difference between populations firing at the same rate grows like sqrt(spikes): margin ~ sqrt(group size)
export const marginOf = (g, gs) => Math.max(3, Math.round(DEC.k * Math.sqrt(gs) * 1.5 / g.kDec));

/* THE REAPER: character-level judging. +1 per correct character, -2 per incorrect character, 0 for abstaining
   (or for characters left unanswered). Positions are compared left to right ("12" vs "13": +1 - 2 = -1). */
export function judge(given, want) {
  if (given == null) return { s: 0, ok: 0, bad: 0, abst: 1, max: want.length };
  let ok = 0, bad = 0;
  for (let i = 0; i < Math.max(given.length, want.length); i++) { if (i >= given.length) continue; if (given[i] === want[i]) ok++; else bad++; }
  return { s: ok - 2 * bad, ok, bad, abst: 0, max: want.length };
}
/* verdict between the reigning champion (ka) and a challenger (kb) on the SAME frozen benchmark set:
   the challenger is reaped (replaces the champion) only if it scores >= margin more Reaper points AND
   the paired sign test over items favours it (items it did better on minus items it did worse on >= sqrt(sum)).
   tiebreak for the displayed leader: score, then fewer incorrect characters, then lower mean latency */
export function reaper(ka, kb, contest = null) {
  const va = ka.vec, vb = kb.vec; let b = 0, c = 0;
  for (let i = 0; i < va.length; i++) { const x = +vb[i], y = +va[i]; if (x > y) b++; else if (y > x) c++; }
  const d = kb.score - ka.score, max = ka.max || va.length, need = contest === 'pong' ? 2 : Math.max(3, Math.ceil(0.05 * max));
  const sig = b - c >= Math.max(1, Math.sqrt(b + c));
  const lead = d !== 0 ? (d > 0 ? 1 : 0) : (ka.wrong !== kb.wrong ? (kb.wrong < ka.wrong ? 1 : 0) : ((kb.lat ?? 1e9) < (ka.lat ?? 1e9) ? 1 : 0));
  return { score: [ka.score, kb.score], ok: [ka.correct, kb.correct], bad: [ka.wrong, kb.wrong], abst: [ka.abstain, kb.abstain], lat: [ka.lat, kb.lat],
    margin: d, need, b, c, sig, reaped: d >= need && sig, lead, max };
}

/* ChoiceMatch: the trial state machine for 1 or 2 players, advanced in 1 ms steps (live views step it in slices,
   headless runs in one go). Players: { brain } or { human: true } (a human answers through answer(k, choice)).
   Per trial: stimulus on -> each brain answers when one choice population leads the others by its margin (from
   minMs on) -> the chosen population is committed (driven) for commitMs, then the reward arrives (+hitR if every
   character is right, -missR otherwise, nothing for abstaining) and the stimulus goes off -> inter-trial gap.
   A brain that has not answered by maxMs abstains. */
export class ChoiceMatch {
  constructor(contest, players, next, opts = {}) {
    this.C = contest; this.P = players; this.next = next; this.T = { ...TRIAL, ...opts }; this.learn = opts.learn !== false;
    this.t = 0; this.phase = 'iti'; this.pt = this.T.iti; this.trials = 0; this.events = []; this.item = null;
    const n = players.length; this.n = n;
    this.st = { score: Array(n).fill(0), ok: Array(n).fill(0), bad: Array(n).fill(0), abst: Array(n).fill(0), right: Array(n).fill(0), first: Array(n).fill(0), lat: Array(n).fill(0), latN: Array(n).fill(0) };
    this.seg = []; this.segAcc = { r: Array(n).fill(0), n: 0, t: 0 };
  }
  startTrial() {
    this.item = this.next(this.trials); this.phase = 'stim'; this.pt = 0;
    this.out = this.P.map(() => ({ c: -1, t: null })); this.done = new Uint8Array(this.n); this.until = new Int32Array(this.n);
    for (const p of this.P) if (p.brain) { p.brain.sense(this.item[0], this.item[1]); p.brain.gcnt.fill(0); p.brain.commit(-1); }
  }
  decide(k, c) {
    const T = this.T, o = this.out[k], b = this.P[k].brain;
    o.c = c; o.t = this.pt; o.j = judge(c >= 0 ? this.C.labels[c] : null, this.C.labels[this.item[2]]);
    this.done[k] = 1; this.until[k] = this.pt + (b ? T.commitMs : 0);
    if (b) b.commit(c, T.commitI);
  }
  answer(k, c) { if (this.phase === 'stim' && !this.done[k] && this.pt >= 0) this.decide(k, c); }
  endTrial() {
    const C = this.C, want = C.labels[this.item[2]], st = this.st, res = [];
    for (let k = 0; k < this.n; k++) {
      const o = this.out[k]; const j = o.j || judge(null, want); o.j = j; res.push(o);
      st.score[k] += j.s; st.ok[k] += j.ok; st.bad[k] += j.bad; st.abst[k] += j.abst; const right = !j.bad && !j.abst && j.ok === j.max; if (right) { st.right[k]++; this.segAcc.r[k]++; }
      if (o.t != null) { st.lat[k] += o.t; st.latN[k]++; }
    }
    const rt = res.map(o => !o.j.bad && !o.j.abst && o.j.ok === o.j.max ? o.t : Infinity), fk = rt.indexOf(Math.min(...rt));
    if (rt[fk] < Infinity) st.first[fk]++;
    this.trials++; this.segAcc.n++;
    this.events.push({ t: this.t, item: this.item, res: res.map(o => ({ c: o.c, t: o.t, s: o.j.s, ok: o.j.ok, bad: o.j.bad, abst: o.j.abst })), first: rt[fk] < Infinity ? fk : -1 });
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
    for (const p of this.P) if (p.brain) { p.brain.blank(); p.brain.commit(-1); }
    this.phase = 'iti'; this.pt = 0;
  }
  stepMs(ms) {
    const T = this.T;
    for (let s = 0; s < ms; s++) {
      for (const p of this.P) if (p.brain) p.brain.run(2);
      this.t++; this.pt++;
      if (this.t % 5000 === 0) { this.seg.push(this.segAcc.r.map(v => v / Math.max(1, this.segAcc.n))); this.segAcc = { r: Array(this.n).fill(0), n: 0 }; }
      if (this.phase === 'iti') { if (this.pt >= T.iti) this.startTrial(); continue; }
      let all = true;
      for (let k = 0; k < this.n; k++) {
        const p = this.P[k], b = p.brain;
        if (this.done[k] === 1 && this.pt >= this.until[k]) {
          this.done[k] = 2;
          if (b) { b.commit(-1); b.blank(); if (this.learn && this.out[k].c >= 0) b.reward(this.out[k].j.bad ? -b.g.missR : b.g.hitR); }
        }
        if (this.done[k] === 0 && this.pt > T.maxMs) { this.done[k] = 2; if (b) b.blank(); }
        if (this.done[k] === 0 && b && this.pt >= T.minMs) {
          let i1 = 0, v1 = -1, v2 = -1; const gc = b.gcnt;
          for (let q = 0; q < gc.length; q++) { const v = gc[q]; if (v > v1) { v2 = v1; v1 = v; i1 = q; } else if (v > v2) v2 = v; }
          if (v1 - v2 >= b.margin) this.decide(k, i1);
        }
        if (this.done[k] !== 2) all = false;
      }
      if (all) this.endTrial();
    }
  }
  stats() {
    const st = this.st, n = Math.max(1, this.trials);
    return { ...JSON.parse(JSON.stringify(st)), trials: this.trials, hitRate: st.right.map(v => v / n), acc: st.right.map(v => v / n), lat: st.lat.map((v, k) => st.latN[k] ? v / st.latN[k] : null), rally: 0, seg: this.seg.map(x => [...x]), t: this.t };
  }
}
// one trial for the given brains on one item (tests and the benchmark)
export function runTrial(brains, contest, item, opts = {}) {
  const m = new ChoiceMatch(contest, brains.map(b => ({ brain: b })), () => item, opts);
  m.pt = m.T.iti; while (m.trials < 1) m.stepMs(1);
  while (m.pt < m.T.iti) m.stepMs(1);
  return m.events[0].res.map(o => ({ c: o.c, t: o.t, j: { s: o.s, ok: o.ok, bad: o.bad, abst: o.abst, max: contest.labels[item[2]].length } }));
}
export function makeBrain(contest, genome, weights, size, frozen = false) {
  const g = frozen ? { ...genome, eta: 0, homeo: 0 } : genome;
  const b = new ChoiceBrain(g, { K: contest.K, n: contest.n, rf: contest.rf, size }, weights);
  b.margin = marginOf(b.g, b.L.gs);
  return b;
}
// the fixed benchmark: every item of the contest, BENCH_REPS times, in one seeded order (common random numbers)
export const BENCH_REPS = 2;
const benchCache = {};
export function benchSet(contest) {
  if (benchCache[contest.id]) return benchCache[contest.id];
  const r = mulberry32(9001), it = []; for (let k = 0; k < BENCH_REPS; k++) it.push(...contest.items);
  let L = it.length; const cap = 80; for (let i = L - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [it[i], it[j]] = [it[j], it[i]]; }
  if (L > cap) { it.length = Math.max(cap, contest.items.length); }
  return (benchCache[contest.id] = it);
}
export function choiceBenchmark(contest, genome, weights, size) {
  const b = makeBrain(contest, genome, weights, size, true), set = benchSet(contest);
  const m = new ChoiceMatch(contest, [{ brain: b }], i => set[i], { learn: false }); const vec = [];
  let max = 0, i0 = 0;
  while (m.trials < set.length) { m.stepMs(1); if (m.events.length && m.trials > i0) { const e = m.events[m.events.length - 1]; vec.push(e.res[0].s); max += contest.labels[e.item[2]].length; i0 = m.trials; } }
  const st = m.stats();
  return { fit: st.score[0] / max, score: st.score[0], correct: st.ok[0], wrong: st.bad[0], abstain: st.abst[0], max, n: set.length, acc: st.right[0] / set.length, lat: st.lat[0], vec };
}
// a duel: both brains learn while they race on the same random items for matchSec seconds of simulated time
export function runChoiceDuel(job) {
  const C = CONTEST[job.contest], size = job.size || 2800;
  const A = makeBrain(C, job.gA, job.wA, size), B = makeBrain(C, job.gB, job.wB, size), r = mulberry32(job.seed);
  const m = new ChoiceMatch(C, [{ brain: A }, { brain: B }], () => pick(r, C.items));
  m.stepMs(Math.round(job.matchSec * 1000));
  const st = m.stats(); st.score = [...st.score];
  const wA = A.exportWeights(), wB = B.exportWeights();
  const bench = job.bench === false ? null : [choiceBenchmark(C, job.gA, wA, size), choiceBenchmark(C, job.gB, wB, size)];
  return { id: job.id, stats: st, wA: job.lamarck ? wA : null, wB: job.lamarck ? wB : null, bench };
}
