/* NEURO ARENA: the contests on the carousel, THE REAPER (the judge), and the trial runner for choice brains.
   Every non-Pong contest is a short-horizon two-player quiz: both brains see the same stimulus at the same moment
   and race to answer by making one of their choice populations win. Answers are strings (e.g. "12", "T") and are
   judged per character. */
import { mulberry32 } from './brain.js';
import { ChoiceBrain } from './cbrain.js';
import { PUZZLE5, DICT5 } from './words5.js';

const D = n => Array.from({ length: n }, (_, k) => String(k));
const pick = (r, a) => a[Math.floor(r() * a.length)];
const WORDS = ['CAT', 'DOG', 'SUN', 'PIG', 'BEE', 'OWL', 'FOX', 'COW', 'HEN', 'RAT', 'BUS', 'CUP', 'HAT', 'MAP', 'JAM', 'BOX'];
const W1 = [...new Set(WORDS.map(w => w[0]))].sort(), W2 = [...new Set(WORDS.map(w => w[1]))].sort(), W3 = [...new Set(WORDS.map(w => w[2]))].sort();
/* Word completion: a five-letter word with one letter blanked out (any of the 5 positions); answer the missing letter.
   Input = slot 0: the blank's position (5 symbols); slot 1: a position x letter grid (5 x 26 = 130 symbols), the
   four known letters are on at once. Association cells are conjunctions (blank at p) AND (letter l at position q),
   e.g. "the gap is 1st and the 2nd letter is I". THE REAPER accepts ANY letter that makes a word of DICT5 (8,636
   five-letter words), so _IGHT -> N is as right as L. Item: [p, [q*26+l...], answer, 'L_GHT', word, valid letters, rank] */
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const W5 = (() => { const r = mulberry32(55), a = [...PUZZLE5]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
const W5ITEMS = []; for (let rk = 0; rk < W5.length; rk++) { const w = W5[rk]; for (let p = 0; p < 5; p++) {
  const syms = []; for (let q = 0; q < 5; q++) if (q !== p) syms.push(q * 26 + AZ.indexOf(w[q]));
  const valid = AZ.filter(c => DICT5.has(w.slice(0, p) + c + w.slice(p + 1))).join('');
  W5ITEMS.push([p, syms, AZ.indexOf(w[p]), w.slice(0, p) + '_' + w.slice(p + 1), w, valid, rk]); } }
const W5TILES = (() => { const s = new Set(); for (const it of W5ITEMS) for (const x of it[1]) s.add(it[0] * 1000 + x); return [...s].sort((a, b) => a - b).map(v => [Math.floor(v / 1000), v % 1000]); })();
// curriculum: few words with the LAST letter missing -> few words, any position -> more words -> all words, any position
const TXL = [{ n: 25, any: 0 }, { n: 25, any: 1 }, { n: 80, any: 1 }, { n: 200, any: 1 }, { n: W5.length, any: 1 }];

/* a contest: K answers (labels), two input slots with n[c] symbols (sym[c] names them for the display),
   all(): every distinct item [x0, x1, answerIndex, display]; items are drawn uniformly from all() */
export const CONTESTS = [
  { id: 'pong', name: 'Pong', icon: '🏓', kind: 'pong', blurb: 'Return the ball. A miss gives the other brain the point.' },
  // the symbolic contests with a curriculum: levels[] = the largest operand (or number) of each level; inLevel(item, L)
  { id: 'add', name: 'Addition', icon: '➕', kind: 'choice', blurb: 'a + b, starting at 0–2 + 0–2 and growing to 0–9 + 0–9 as the brains pass 80% (two-digit answers are judged per digit).',
    n: [10, 10], labels: D(19), rf: [0.35, 0.35], levels: [2, 3, 4, 5, 6, 7, 8, 9], inLevel: (it, L) => it[0] <= L && it[1] <= L, levelName: L => `0–${L} + 0–${L}`,
    all: () => { const o = []; for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) o.push([a, b, a + b, `${a} + ${b} = ?`]); return o; } },
  { id: 'add5', name: 'Addition (fixed 0..4)', icon: '➕', kind: 'choice', hidden: true, blurb: 'a + b with a, b in 0..4: answer 0..8 (no curriculum).',
    n: [5, 5], labels: D(9), rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) o.push([a, b, a + b, `${a} + ${b} = ?`]); return o; } },
  { id: 'sub', name: 'Subtraction', icon: '➖', kind: 'choice', blurb: 'a − b with 0 ≤ b ≤ a, starting at a ≤ 2 and growing to a ≤ 9 as the brains pass 80%.',
    n: [10, 10], labels: D(10), rf: [0.35, 0.35], levels: [2, 3, 4, 5, 6, 7, 8, 9], inLevel: (it, L) => it[0] <= L, levelName: L => `0 ≤ b ≤ a ≤ ${L}`,
    all: () => { const o = []; for (let a = 0; a < 10; a++) for (let b = 0; b <= a; b++) o.push([a, b, a - b, `${a} − ${b} = ?`]); return o; } },
  { id: 'big', name: 'Bigger number', icon: '⚖️', kind: 'choice', blurb: 'Which side holds the bigger digit? Answer L or R.',
    n: [10, 10], labels: ['L', 'R'], rf: [0.35, 0.35],
    all: () => { const o = []; for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (a !== b) o.push([a, b, a > b ? 0 : 1, `${a}  vs  ${b}`]); return o; } },
  // the number is sensed by digit place: slot 0 = the ones digit, slot 1 = the tens digit (the hundreds digit is
  // shown but not wired: it never matters). Part of the association layer is tuned to one digit place only, so a
  // brain that discovers "only the ones digit matters" can generalise to numbers it has never seen
  { id: 'parity', name: 'Even or odd', icon: '🎲', kind: 'choice', blurb: 'Rapid fire: is the number even (E) or odd (O)? 0–9, then 0–99, then 0–999 as the brains pass 80%.',
    n: [10, 10], labels: ['E', 'O'], rf: [0.35, 0.35], marg: 0.4, levels: [9, 99, 999], inLevel: (it, L) => it[4] <= L, levelName: L => `0–${L}`,
    all: () => Array.from({ length: 1000 }, (_, v) => [v % 10, Math.floor(v / 10) % 10, v % 2, String(v), v]) },
  { id: 'text', name: 'Word completion', icon: '🔤', kind: 'choice', save: 5, blurb: `Fill in the missing letter of a five-letter word (L_GHT → I). The gap can be any of the 5 letters; any letter that makes a real word counts (_IGHT → N or L). Starts with 25 words and the last letter missing, grows to all ${PUZZLE5.length} words with any letter missing.`,
    n: [5, 130], split: 0.2, currThr: [0.8, 0.5, 0.4, 0.35], aBias: -4, wSA: 0.35, tiles: W5TILES, labels: AZ, rf: [0.35, 0.35], valid: 5,
    levels: [0, 1, 2, 3, 4], inLevel: (it, L) => it[6] < TXL[L].n && (TXL[L].any || it[0] === 4), levelName: L => `${TXL[L].n} words · ${TXL[L].any ? 'any letter' : 'last letter'} missing`,
    chanceOf: items => items.reduce((a, it) => a + it[5].length, 0) / items.length / 26,
    all: () => W5ITEMS },
  { id: 'text3', name: 'Text completion (3 letters)', icon: '🔤', kind: 'choice', hidden: true, blurb: `Complete the word: CA_ → T. Vocabulary: ${WORDS.join(' ')}.`,
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
for (const c of CONTESTS) if (c.kind === 'choice') { c.K = c.labels.length; c.all_ = c.all(); c.items = c.all_; c.chance = c.chanceOf ? c.chanceOf(c.all_) : 1 / c.K; c.nLevels = c.levels ? c.levels.length : 1; }
// the items and chance level of curriculum level lv (contests without levels: all items)
export function itemsAt(C, lv = 0) {
  if (!C.levels) return C.items;
  const L = C.levels[Math.max(0, Math.min(C.levels.length - 1, lv | 0))], key = '_lv' + L;
  return C[key] || (C[key] = C.all_.filter(it => C.inLevel(it, L)));
}
export const chanceAt = (C, lv = 0) => C.kind !== 'choice' ? 0 : C.chanceOf ? C.chanceOf(itemsAt(C, lv)) : C.levels ? 1 / new Set(itemsAt(C, lv).map(it => it[2])).size : C.chance;
export const levelName = (C, lv = 0) => C.levels ? `level ${(lv | 0) + 1}/${C.levels.length} · ${C.levelName(C.levels[Math.min(lv | 0, C.levels.length - 1)])}` : '';
/* lifetime curriculum: advance a level when the rolling accuracy of the last `win` trials reaches `thr` */
export const CURR = { thr: 0.9, win: 60 };
export class Curriculum {
  constructor(C, level = 0) { this.C = C; this.level = level | 0; this.h = []; this.ups = []; }
  get items() { return itemsAt(this.C, this.level); }
  note(right, t = 0) {
    if (!this.C.levels) return false;
    this.h.push(right ? 1 : 0); if (this.h.length > CURR.win) this.h.shift();
    if (this.h.length >= CURR.win && this.h.reduce((a, b) => a + b, 0) >= (this.C.currThr ? this.C.currThr[this.level] : CURR.thr) * CURR.win && this.level < this.C.levels.length - 1) { this.level++; this.h = []; this.ups.push(t); return true; }
    return false;
  }
}

/* the explicit trial loop (all times in ms of simulated time):
   PRESENT  presentMs  the problem is shown: the sensory drive comes on, activity propagates; nothing is counted
   THINKING thinkMs    the answer populations integrate evidence; their spikes are COUNTED over the whole window
   ANSWER   commitMs   at the end of the window the answer is accepted: winner-take-all on the spike counts,
                       abstain if the winner's lead is below the confidence threshold. The chosen population is
                       driven (committed) so the eligibility traces clearly mark the answer that was given
   JUDGED   -          THE REAPER scores it; the dopamine pulse (reward - expected reward) is delivered now, after
                       acceptance, onto traces that span the whole trial
   ITI      iti        the stimulus is off and the brain's fast state is reset to rest (no carry-over) */
export const TRIAL = { presentMs: 40, thinkMs: 300, commitMs: 30, iti: 120, commitI: 3, humanMs: 3000, abstainR: -0.05 };
export const PHASES = ['present', 'think', 'answer', 'judged'];
// decision margin (spikes the leading population must be ahead by) from the decoder-gain gene
export const DEC = { k: 1 };
// confidence threshold for accepting an answer: the count lead needed over the runner-up, ~ k * sqrt(top + second)
// (Poisson noise of the counts), scaled by the decoder-gain gene; below it the brain abstains
export const marginOf = (g, gs) => Math.max(3, Math.round(DEC.k * Math.sqrt(gs) * 1.5 / g.kDec));
export const confNeed = (b, v1, v2, f = 1) => f * Math.max(b.margin, DEC.k * 1.5 / b.g.kDec * Math.sqrt(v1 + v2));
// the confidence threshold (abstain when the lead is too small) is applied only against a human (Play).
// In practice duels a brain must commit (it learns only from answers it gave, so abstaining starved learning:
// ~70% abstains, no dopamine signal), and the frozen benchmark is a forced choice too (test = 0).
export const PRACTICE = { conf: 0, test: 0 };

/* THE REAPER: character-level judging. +1 per correct character, -2 per incorrect character, 0 for abstaining
   (or for characters left unanswered). Positions are compared left to right ("12" vs "13": +1 - 2 = -1). */
export function judge(given, want) {
  if (given == null) return { s: 0, ok: 0, bad: 0, abst: 1, max: want.length };
  let ok = 0, bad = 0;
  for (let i = 0; i < Math.max(given.length, want.length); i++) { if (i >= given.length) continue; if (given[i] === want[i]) ok++; else bad++; }
  return { s: ok - 2 * bad, ok, bad, abst: 0, max: want.length };
}
// judge an answer index for an item; contests with a `valid` field accept any valid alternative (full credit, j.alt)
export function judgeItem(C, item, c) {
  const want = C.labels[item[2]], given = c >= 0 ? C.labels[c] : null;
  if (given != null && C.valid != null && given !== want && item[C.valid] && item[C.valid].includes(given)) return { ...judge(given, given), alt: 1, intended: want };
  return judge(given, want);
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
   headless runs in one go). Players: { brain } or { human: true } (a human answers through answer(k, choice)
   any time until humanMs). Brains follow PRESENT -> THINKING -> ANSWER -> JUDGED -> ITI (see TRIAL). */
export class ChoiceMatch {
  constructor(contest, players, next, opts = {}) {
    this.C = contest; this.P = players; this.next = next; this.T = { ...TRIAL, ...opts }; this.learn = opts.learn !== false;
    this.t = 0; this.phase = 'iti'; this.pt = this.T.iti; this.trials = 0; this.events = []; this.item = null; this.onJudge = opts.onJudge || null;
    const n = players.length; this.n = n; this.hasHuman = players.some(p => p.human);
    this.st = { score: Array(n).fill(0), ok: Array(n).fill(0), bad: Array(n).fill(0), abst: Array(n).fill(0), right: Array(n).fill(0), alt: Array(n).fill(0), first: Array(n).fill(0), lat: Array(n).fill(0), latN: Array(n).fill(0) };
    this.seg = []; this.segAcc = { r: Array(n).fill(0), n: 0, t: 0 };
  }
  get acceptAt() { return this.T.presentMs + this.T.thinkMs; }
  startTrial() {
    this.item = this.next(this.trials); this.phase = 'present'; this.pt = 0;
    this.out = this.P.map(() => ({ c: -1, t: null, cnt: null })); this.done = new Uint8Array(this.n); this.until = new Int32Array(this.n);
    for (const p of this.P) if (p.brain) { p.brain.quiesce(); p.brain.sense(this.item[0], this.item[1]); p.brain.commit(-1); }
  }
  decide(k, c) {
    const T = this.T, o = this.out[k], b = this.P[k].brain;
    o.c = c; o.t = this.pt; o.j = judgeItem(this.C, this.item, c);
    this.done[k] = 1; this.until[k] = this.pt + (b && c >= 0 ? T.commitMs : 0);
    if (b) b.commit(c, T.commitI);
  }
  answer(k, c) { if ((this.phase === 'present' || this.phase === 'think' || this.phase === 'answer') && !this.done[k]) this.decide(k, c); }
  // ACCEPT: winner-take-all over the window's spike counts, abstain when the lead is below the confidence threshold
  acceptBrain(k) {
    const b = this.P[k].brain, gc = b.gcnt; let i1 = 0, v1 = -1, v2 = -1;
    for (let q = 0; q < gc.length; q++) { const v = gc[q]; if (v > v1) { v2 = v1; v1 = v; i1 = q; } else if (v > v2) v2 = v; }
    this.out[k].cnt = Array.from(gc); this.out[k].conf = v1 - v2; this.out[k].need = confNeed(b, v1, v2, this.hasHuman ? 1 : this.learn && b.g.eta > 0 ? PRACTICE.conf : PRACTICE.test);
    this.decide(k, v1 - v2 >= this.out[k].need ? i1 : -1);
  }
  endTrial() {
    const C = this.C, want = C.labels[this.item[2]], st = this.st, res = [];
    for (let k = 0; k < this.n; k++) {
      const o = this.out[k]; const j = o.j || judge(null, want); o.j = j; res.push(o);
      st.score[k] += j.s; st.ok[k] += j.ok; st.bad[k] += j.bad; st.abst[k] += j.abst; const right = !j.bad && !j.abst && j.ok === j.max; if (right) { st.right[k]++; this.segAcc.r[k]++; if (j.alt) st.alt[k]++; }
      if (o.t != null) { st.lat[k] += o.t; st.latN[k]++; }
    }
    const rt = res.map(o => !o.j.bad && !o.j.abst && o.j.ok === o.j.max ? o.t : Infinity), fk = rt.indexOf(Math.min(...rt));
    if (rt[fk] < Infinity) st.first[fk]++;
    this.trials++; this.segAcc.n++;
    this.events.push({ t: this.t, item: this.item, res: res.map(o => ({ c: o.c, t: o.t, s: o.j.s, ok: o.j.ok, bad: o.j.bad, abst: o.j.abst, alt: o.j.alt || 0, da: o.da, conf: o.conf, cnt: o.cnt })), first: rt[fk] < Infinity ? fk : -1 });
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
    if (this.onJudge) this.onJudge(this.events[this.events.length - 1], this);
    for (const p of this.P) if (p.brain) { p.brain.blank(); p.brain.commit(-1); }
    this.phase = 'iti'; this.pt = 0;
  }
  // JUDGED: the Reaper verdict for this brain is known -> dopamine now (correct +hitR, wrong -missR, abstain small)
  judgeBrain(k) {
    const b = this.P[k].brain, o = this.out[k]; this.done[k] = 2;
    b.commit(-1); b.blank();
    if (this.learn) { const j = o.j; const r = j.abst ? this.T.abstainR : (j.bad ? -b.g.missR : b.g.hitR); o.da = +b.accept(r, !!j.abst, o.c).toFixed(3); }
  }
  stepMs(ms) {
    const T = this.T, acc = this.acceptAt;
    for (let s = 0; s < ms; s++) {
      for (const p of this.P) if (p.brain) p.brain.run(2);
      this.t++; this.pt++;
      if (this.t % 5000 === 0) { this.seg.push(this.segAcc.r.map(v => v / Math.max(1, this.segAcc.n))); this.segAcc = { r: Array(this.n).fill(0), n: 0 }; }
      if (this.phase === 'iti') { if (this.pt >= T.iti) this.startTrial(); continue; }
      if (this.phase === 'present' && this.pt >= T.presentMs) { this.phase = 'think'; for (const p of this.P) if (p.brain) p.brain.gcnt.fill(0); }
      let all = true;
      for (let k = 0; k < this.n; k++) {
        const p = this.P[k], b = p.brain;
        if (b) {
          if (this.done[k] === 0 && this.pt >= acc) this.acceptBrain(k);
          if (this.done[k] === 1 && this.pt >= this.until[k]) this.judgeBrain(k);
        } else if (this.done[k] === 0 && this.pt >= Math.max(acc, T.humanMs)) this.done[k] = 2;
        else if (this.done[k] === 1) this.done[k] = 2;
        if (this.done[k] !== 2) all = false;
      }
      if (this.phase === 'think' && this.pt >= acc) this.phase = 'answer';
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
  return m.events[0].res.map(o => ({ c: o.c, t: o.t, conf: o.conf, da: o.da, cnt: o.cnt, j: { s: o.s, ok: o.ok, bad: o.bad, abst: o.abst, alt: o.alt, max: contest.labels[item[2]].length } }));
}
export function makeBrain(contest, genome, weights, size, frozen = false) {
  const g = frozen ? { ...genome, eta: 0, homeo: 0 } : genome;
  const b = new ChoiceBrain(g, { K: contest.K, n: contest.n, rf: contest.rf, marg: contest.marg || 0, tiles: contest.tiles, mtiles: contest.mtiles, mfrac: contest.mfrac, mW: contest.mW, wSlot: contest.wSlot, split: contest.split, aBias: contest.aBias, wSA: contest.wSA, size }, weights);
  b.margin = marginOf(b.g, b.L.gs);
  return b;
}
// the fixed benchmark: every item of the contest (at the curriculum level), BENCH_REPS times when there are few,
// in one seeded order (common random numbers), at most BENCH_CAP items
export const BENCH_REPS = 2, BENCH_CAP = 100;
const benchCache = {};
export function benchSet(contest, level = 0) {
  const key = contest.id + ':' + (contest.levels ? level | 0 : 0);
  if (benchCache[key]) return benchCache[key];
  const src = itemsAt(contest, level), r = mulberry32(9001), it = []; for (let k = 0; k < (src.length <= BENCH_CAP / 2 ? BENCH_REPS : 1); k++) it.push(...src);
  for (let i = it.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [it[i], it[j]] = [it[j], it[i]]; }
  if (it.length > BENCH_CAP) it.length = BENCH_CAP;
  return (benchCache[key] = it);
}
export function choiceBenchmark(contest, genome, weights, size, level = 0, set = null) {
  const b = makeBrain(contest, genome, weights, size, true); set = set || benchSet(contest, level);
  const m = new ChoiceMatch(contest, [{ brain: b }], i => set[i], { learn: false, iti: 20 }); const vec = [];
  let max = 0, i0 = 0;
  while (m.trials < set.length) { m.stepMs(1); if (m.events.length && m.trials > i0) { const e = m.events[m.events.length - 1]; vec.push(e.res[0].s); max += contest.labels[e.item[2]].length; i0 = m.trials; } }
  const st = m.stats();
  return { fit: st.score[0] / max, score: st.score[0], correct: st.ok[0], wrong: st.bad[0], abstain: st.abst[0], max, n: set.length, acc: st.right[0] / set.length, alt: st.alt[0], lat: st.lat[0], vec, level: contest.levels ? level | 0 : null };
}
// a duel: both brains learn while they race on the same random items for matchSec seconds of simulated time
export function runChoiceDuel(job) {
  const C = CONTEST[job.contest], size = job.size || 2800;
  const A = makeBrain(C, job.gA, job.wA, size), B = makeBrain(C, job.gB, job.wB, size), r = mulberry32(job.seed);
  const items = itemsAt(C, job.level), m = new ChoiceMatch(C, [{ brain: A }, { brain: B }], () => pick(r, items));
  m.stepMs(Math.round(job.matchSec * 1000));
  const st = m.stats(); st.score = [...st.score];
  const wA = A.exportWeights(), wB = B.exportWeights();
  const bench = job.bench === false ? null : [choiceBenchmark(C, job.gA, wA, size, job.level), choiceBenchmark(C, job.gB, wB, size, job.level)];
  return { id: job.id, stats: st, wA: job.lamarck ? wA : null, wB: job.lamarck ? wB : null, bench };
}
