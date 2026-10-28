/* GENESIS: PROBLEM GENERATOR (task families, fresh batteries, surface scrambles), THE REAPER and the evaluator. Shared by the browser (Web Worker) and Node (tools/).
   Every task speaks one language: a trial shows a short sequence of string tokens, the learner answers one
   token from the task's answer alphabet (or abstains with null), then sees the correct answer.
   A learner never sees the task's name or rule: init() gets only { answers, inputLen }.
   THE REAPER: +1 right, -2 wrong, 0 abstain (as in Neuro Arena). Under that rule answering only pays when
   the learner is more than 2/3 sure, so calibrated abstention is part of intelligence here. */
import { PUZZLE5, DICT5 } from './words5.js';

export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ri = (r, n) => Math.floor(r() * n);
const D = '0123456789'.split('');
const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const RPS = ['R', 'P', 'S'], BEAT = { R: 'P', P: 'S', S: 'R' };
const spf = n => { for (const p of [2, 3, 5, 7]) if (n % p === 0) return String(p); return 'P'; };
// a fixed, seeded subset of the puzzle words so that words can recur within one lifetime
const WORDS = (() => { const w = PUZZLE5.slice(), r = mulberry32(55); for (let i = w.length - 1; i > 0; i--) { const j = ri(r, i + 1); [w[i], w[j]] = [w[j], w[i]]; } return w.slice(0, 120); })();

/* Each task: gen(rng, state) -> { input:[tokens], answer, ok?(tok) } (ok: alternative right answers). */
export const TASKS = [
  // ---------------- TRAINING tasks (the designers see these scores) ----------------
  { id: 'add', name: 'Addition', icon: '➕', split: 'train', answers: D.slice(0, 9), inputLen: 3,
    blurb: 'a + b with a, b in 0..4. Answer the digit of the sum.',
    gen(r) { const a = ri(r, 5), b = ri(r, 5); return { input: [D[a], '+', D[b]], answer: D[a + b] }; } },
  { id: 'seq', name: 'Sequence continuation', icon: '📈', split: 'train', answers: D, inputLen: 3,
    blurb: 'a, a+d, a+2d (mod 10) with d in 1..3. What comes next?',
    gen(r) { const a = ri(r, 10), d = 1 + ri(r, 3); return { input: [0, 1, 2].map(k => D[(a + k * d) % 10]), answer: D[(a + 3 * d) % 10] }; } },
  { id: 'bigger', name: 'Bigger number', icon: '⚖️', split: 'train', answers: ['L', 'R'], inputLen: 2,
    blurb: 'Two different digits: is the left (L) or the right (R) one bigger?',
    gen(r) { const a = ri(r, 10); let b = ri(r, 9); if (b >= a) b++; return { input: [D[a], D[b]], answer: a > b ? 'L' : 'R' }; } },
  { id: 'divisor', name: 'Smallest divisor', icon: '🔢', split: 'train', answers: ['2', '3', '5', '7', 'P'], inputLen: 2,
    blurb: 'A number 10..99 as two digits: its smallest divisor above 1 (2, 3, 5, 7, or P for a prime above 7).',
    gen(r) { const n = 10 + ri(r, 90); return { input: [D[Math.floor(n / 10)], D[n % 10]], answer: spf(n) }; } },
  { id: 'rps', name: 'Rock paper scissors (cycler)', icon: '✊', split: 'train', answers: RPS, inputLen: 2,
    blurb: "The opponent cycles R → P → S. You see its last two moves: play the move that beats its next one.",
    gen(r, s) { s.k = (s.k ?? ri(r, 3)); const m1 = RPS[s.k % 3], m2 = RPS[(s.k + 1) % 3], nx = RPS[(s.k + 2) % 3]; s.k += 1 + (r() < 0.3 ? ri(r, 2) : 0); return { input: [m1, m2], answer: BEAT[nx] }; } },
  { id: 'pick', name: 'Pick by position', icon: '👉', split: 'train', answers: L.slice(0, 6).concat(), inputLen: 4,
    blurb: 'Three letters A..F and a position 1..3: answer the letter at that position.',
    gen(r) { const x = [0, 1, 2].map(() => L[ri(r, 6)]), q = ri(r, 3); return { input: [...x, '#' + (q + 1)], answer: x[q] }; } },
  // ---------------- SELECTION families: THE REAPER's held-out batteries (fresh seed + fresh scramble every generation) ----------------
  { id: 'sub', name: 'Subtraction', icon: '➖', split: 'select', answers: D.slice(0, 7), inputLen: 3,
    blurb: 'a − b with 0 ≤ b ≤ a ≤ 6.',
    gen(r) { const a = ri(r, 7), b = ri(r, a + 1); return { input: [D[a], '-', D[b]], answer: D[a - b] }; } },
  { id: 'pattern', name: 'Pattern completion', icon: '🧩', varLen: true, split: 'select', answers: L.slice(0, 5), inputLen: 7,
    blurb: 'Four to seven letters repeating with period 2 or 3 (ABCAB, ABABAB…): the next letter.',
    gen(r) { const p = 2 + ri(r, 2), n = 4 + ri(r, 4), u = []; while (u.length < p) { const c = L[ri(r, 5)]; if (!u.includes(c)) u.push(c); } return { input: [...Array(n).keys()].map(i => u[i % p]), answer: u[n % p] }; } },
  { id: 'word5', name: '5-letter word', icon: '🔤', split: 'select', answers: L, inputLen: 5,
    blurb: 'A common 5-letter word with one letter blanked (_). Any letter that makes a real word counts.',
    gen(r) { const w = WORDS[ri(r, WORDS.length)], q = ri(r, 5), inp = w.split(''); inp[q] = '_'; const ok = t => typeof t === 'string' && t.length === 1 && DICT5.has(w.slice(0, q) + t + w.slice(q + 1)); return { input: inp, answer: w[q], ok }; } },
  { id: 'simon', name: 'Simon memory', icon: '🚦', varLen: true, split: 'select', answers: ['R', 'G', 'B', 'Y'], inputLen: 6,
    blurb: 'A sequence of 3 to 5 coloured lights then a query #k: which colour was light k?',
    gen(r) { const n = 3 + ri(r, 3), x = []; for (let i = 0; i < n; i++) x.push('RGBY'[ri(r, 4)]); const q = ri(r, n); return { input: [...x, '#' + (q + 1)], answer: x[q] }; } },
  { id: 'analogy', name: 'Analogy', icon: '🔀', split: 'select', answers: L.slice(0, 8), inputLen: 3,
    blurb: 'A is to B as C is to ? Letters A..H; the hidden rule is a shift by 1..3 (wrapping H→A).',
    gen(r) { const k = 1 + ri(r, 3), a = ri(r, 8), c = ri(r, 8); return { input: [L[a], L[(a + k) % 8], L[c]], answer: L[(c + k) % 8] }; } },
  { id: 'pong', name: 'Pong control', icon: '🏓', split: 'select', answers: ['U', 'D', 'S'], inputLen: 4,
    blurb: 'Ball row 0..7, its vertical direction U/D, your paddle row 0..7 and the ball\'s distance 1..4: move U, D or S(tay) toward where the ball will cross (it bounces off the walls).',
    gen(r) { const by = ri(r, 8), dir = r() < 0.5 ? 'U' : 'D', py = ri(r, 8), dist = 1 + ri(r, 4); let y = by + (dir === 'U' ? dist : -dist); while (y < 0 || y > 7) y = y < 0 ? -y : 14 - y; return { input: [D[by], dir, D[py], D[dist]], answer: y > py ? 'U' : y < py ? 'D' : 'S' }; } },
  { id: 'rps2', name: 'Rock paper scissors (looper)', icon: '✌️', split: 'select', answers: RPS, inputLen: 2,
    blurb: 'A new opponent loops R R P S S P … You see its last two moves: beat its next one.',
    gen(r, s) { s.k = (s.k ?? ri(r, 6)); const seq = 'RRPSSP', m = i => seq[((i % 6) + 6) % 6]; const x = [m(s.k), m(s.k + 1)], nx = m(s.k + 2); s.k += 1 + (r() < 0.3 ? ri(r, 3) : 0); return { input: x, answer: BEAT[nx] }; } },
  { id: 'logic', name: 'Boolean logic', icon: '🔣', domain: 'logic', split: 'select', answers: ['0', '1'], inputLen: 3,
    blurb: 'a OP b with bits a, b and OP one of & (and), | (or), ^ (xor).',
    gen(r) { const a = ri(r, 2), b = ri(r, 2), op = '&|^'[ri(r, 3)]; return { input: [D[a], op, D[b]], answer: D[op === '&' ? a & b : op === '|' ? a | b : a ^ b] }; } },
  { id: 'oddone', name: 'Odd one out', icon: '🦄', domain: 'logic', split: 'select', answers: ['1', '2', '3', '4'], inputLen: 4,
    blurb: 'Four letters, three the same: the position (1-4) of the odd one.',
    gen(r) { const a = ri(r, 8); let b = ri(r, 7); if (b >= a) b++; const q = ri(r, 4), x = [0, 1, 2, 3].map(i => L[i === q ? b : a]); return { input: x, answer: D[q + 1] }; } },
  { id: 'grid', name: 'Grid path planning', icon: '🗺️', domain: 'planning', split: 'select', answers: ['N', 'E', 'S', 'W'], inputLen: 6,
    blurb: 'On a 5×5 grid: you (x,y), the goal (x,y), a wall cell (x,y). Any first move on a shortest path that avoids the wall is right.',
    gen(r) { for (;;) { const c = () => [ri(r, 5), ri(r, 5)], a = c(), g = c(), b = c(); const k = p => p[0] + ',' + p[1];
        if (k(a) === k(g) || k(b) === k(a) || k(b) === k(g)) continue;
        const dist = {}; dist[k(g)] = 0; const qu = [g]; const MV = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
        while (qu.length) { const p = qu.shift(); for (const m of Object.values(MV)) { const n2 = [p[0] + m[0], p[1] + m[1]]; if (n2[0] < 0 || n2[0] > 4 || n2[1] < 0 || n2[1] > 4 || k(n2) === k(b) || dist[k(n2)] != null) continue; dist[k(n2)] = dist[k(p)] + 1; qu.push(n2); } }
        const good = Object.keys(MV).filter(m => { const n2 = [a[0] + MV[m][0], a[1] + MV[m][1]]; return dist[k(n2)] === dist[k(a)] - 1; });
        if (!good.length) continue;
        return { input: [a[0], a[1], g[0], g[1], b[0], b[1]].map(v => D[v]), answer: good[0], ok: t => good.includes(t) }; } } },
  { id: 'sortstep', name: 'Ordering steps', icon: '🧱', domain: 'planning', split: 'select', answers: ['1', '2', '3'], inputLen: 4,
    blurb: 'Four numbered blocks in a row, not yet in order: where (1-3) does a bubble sort make its first swap?',
    gen(r) { for (;;) { const x = [1, 2, 3, 4]; for (let i = 3; i > 0; i--) { const j = ri(r, i + 1); [x[i], x[j]] = [x[j], x[i]]; } const q = [0, 1, 2].find(i => x[i] > x[i + 1]); if (q == null) continue; return { input: x.map(v => D[v]), answer: D[q + 1] }; } } },
  { id: 'nextword', name: 'Next word', icon: '💬', domain: 'language', split: 'select', answers: ['FISH', 'BREAD', 'BOOK', 'MAP', 'MILK', 'TEA'], inputLen: 2,
    blurb: 'A tiny language: subject + verb, then any object that fits the verb (eats fish/bread, reads book/map, drinks milk/tea).',
    gen(r) { const V = { EATS: ['FISH', 'BREAD'], READS: ['BOOK', 'MAP'], DRINKS: ['MILK', 'TEA'] }, v = Object.keys(V)[ri(r, 3)], s = ['CAT', 'DOG', 'KID'][ri(r, 3)];
      return { input: [s, v], answer: V[v][ri(r, 2)], ok: t => V[v].includes(t) }; } },
  // ---------------- SEALED families: a final test that is NEVER used for selection ----------------
  { id: 'syllogism', name: 'Transitive inference', icon: '🔗', domain: 'logic', split: 'sealed', answers: ['T', 'F'], inputLen: 6,
    blurb: 'x beats y, y beats z (as three pairs of letters), then a query pair: does the first beat the second?',
    gen(r) { const u = []; while (u.length < 3) { const c = L[ri(r, 8)]; if (!u.includes(c)) u.push(c); } const fw = r() < 0.5; return { input: [u[0], u[1], u[1], u[2], fw ? u[0] : u[2], fw ? u[2] : u[0]], answer: fw ? 'T' : 'F' }; } },
  { id: 'pathkey', name: 'Key then door', icon: '🗝️', domain: 'planning', split: 'sealed', answers: ['L', 'R'], inputLen: 4,
    blurb: 'A corridor 0..6: your cell, the key, the door, and whether you hold the key (Y/N). Step L or R toward the key first, then the door.',
    gen(r) { for (;;) { const a = ri(r, 7), k = ri(r, 7), d = ri(r, 7), h = r() < 0.5; const t = h ? d : k; if (t === a || k === d) continue; return { input: [D[a], D[k], D[d], h ? 'Y' : 'N'], answer: t < a ? 'L' : 'R' }; } } },
  { id: 'count', name: 'Counting', icon: '🧮', domain: 'pattern', split: 'sealed', answers: D.slice(0, 6), inputLen: 6,
    blurb: 'Five letters from A..C, then a query letter: how many times does it appear?',
    gen(r) { const x = [0, 1, 2, 3, 4].map(() => L[ri(r, 3)]), q = L[ri(r, 3)]; return { input: [...x, q], answer: D[x.filter(c => c === q).length] }; } },
];
const DOMAIN = { add: 'arithmetic', seq: 'pattern', bigger: 'logic', divisor: 'arithmetic', rps: 'game', pick: 'memory',
  sub: 'arithmetic', pattern: 'pattern', word5: 'language', simon: 'memory', analogy: 'pattern', pong: 'planning', rps2: 'game' };
for (const t of TASKS) t.domain = t.domain || DOMAIN[t.id];
export const TASK = Object.fromEntries(TASKS.map(t => [t.id, t]));
export const TRAIN = TASKS.filter(t => t.split === 'train').map(t => t.id);
export const SELECT = TASKS.filter(t => t.split === 'select').map(t => t.id);
export const SEALED = TASKS.filter(t => t.split === 'sealed').map(t => t.id);

/* ---------------- surface scrambles ----------------
   A scramble is drawn fresh for every battery: every token (inputs AND answers) is relabelled to a random
   glyph (a random bijection), and for fixed-length families the input positions are permuted. The rule is the
   same; only its surface changes. A solver that learned the rule's structure transfers; one that leaned on
   the familiar look of digits and letters does not. */
const GLYPHS = 'αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ◆◇○●□■△▽☆★♠♣♥♦♪♫'.split('');
export function makeScramble(t, r) {
  const pool = GLYPHS.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = ri(r, i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const fwd = new Map(), inv = new Map(); let k = 0;
  const m = tok => { if (!fwd.has(tok)) { const g = pool[k++ % pool.length] + (k > pool.length ? String(Math.floor(k / pool.length)) : ''); fwd.set(tok, g); inv.set(g, tok); } return fwd.get(tok); };
  const answers = t.answers.map(m);
  let perm = null;
  if (!t.varLen) { perm = [...Array(t.inputLen).keys()]; for (let tries = 0; tries < 10 && perm.every((v, i) => v === i); tries++) for (let i = perm.length - 1; i > 0; i--) { const j = ri(r, i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; } }
  return { answers, perm, map: m, inv, apply(it) { const inp = perm ? perm.map(j => it.input[j]) : it.input; const ok0 = it.ok;
    return { input: inp.map(m), answer: m(it.answer), ok: ok0 ? (g => inv.has(g) && ok0(inv.get(g))) : null, raw: it }; } };
}

// chance: accuracy of a uniform random guesser (Monte Carlo for families with alternative right answers), cached
const _chance = {};
export function chanceOf(id) {
  if (_chance[id] != null) return _chance[id];
  const t = TASK[id]; if (!t) return 0; const r = mulberry32(7), s = {}; let sum = 0;
  for (let i = 0; i < 1500; i++) { const it = t.gen(r, s); sum += it.ok ? t.answers.filter(a => it.ok(a)).length / t.answers.length : 1 / t.answers.length; }
  return (_chance[id] = sum / 1500);
}

/* ---------------- THE REAPER, per answer ---------------- */
export const judge = (item, pred) => pred == null ? 0 : (pred === item.answer || (item.ok && item.ok(pred))) ? 1 : -2;

/* ---------------- sandboxed compilation of a learner ----------------
   A design's code is one JS expression: a factory  (api) => ({ init, observe, predict, learn, size? }).
   api = { genome, params, rand }. The code gets no DOM, no storage and no network (in the browser it runs in
   a Web Worker whose network globals are deleted), and a run over budget is cut off. */
const SHADOW = ['window', 'document', 'self', 'globalThis', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'postMessage', 'localStorage', 'indexedDB', 'caches', 'process', 'require', 'Function', 'eval', 'EventSource', 'navigator', 'location', 'setTimeout', 'setInterval'];
export function compileLearner(code) {
  const f = new Function(...SHADOW, 'return (' + code + '\n);');
  const factory = f(...SHADOW.map(() => undefined));
  if (typeof factory !== 'function') throw new Error('design code must evaluate to a factory function (api) => learner');
  return factory;
}

/* ---------------- one lifetime on one stream ----------------
   A stream = a family, a seed and optionally a scramble. The learner starts from nothing every time (it is
   the LEARNING METHOD that is under selection, not learned weights). Steps to solution = the trial at which
   the last 20 answers first reach 16 right (80%); never = unsolved. */
export const CRIT = { win: 20, need: 16 };
export function makeStepper(factory, stream, { trials = 240, genome = {}, params = {} } = {}) {
  const t = TASK[stream.family], seed = stream.seed;
  const r = mulberry32(seed * 7919 + t.id.length * 104729 + t.id.charCodeAt(0) * 31 + (stream.scrambled ? 17 : 0));
  const sc = stream.scrambled ? makeScramble(t, mulberry32(seed * 131 + 977 + t.id.charCodeAt(1))) : null;
  const answers = sc ? sc.answers : t.answers.slice(), s = {};
  const res = { family: t.id, scrambled: !!stream.scrambled, trials, correct: 0, wrong: 0, abstain: 0, errors: 0, pts: 0, curve: [], steps: null, size: 0, ms: 0, err: null };
  const win = [], binN = Math.max(1, Math.round(trials / 24)); let bin = [0, 0], Lr = null, i = 0, dead = false;
  try { Lr = factory({ genome: JSON.parse(JSON.stringify(genome)), params: { ...params }, rand: mulberry32(seed * 31 + 3) }); Lr.init({ answers: answers.slice(), inputLen: t.inputLen }); }
  catch (e) { res.err = 'init: ' + (e && e.message || e); dead = true; }
  return { res, answers, learner: Lr, get i() { return i; }, get done() { return i >= trials; },
    step() {
      let it = t.gen(r, s); if (sc) it = sc.apply(it);
      let p = null;
      if (!dead) { try { Lr.observe(it.input.slice()); p = Lr.predict(); p = p == null ? null : String(p); if (p !== null && !answers.includes(p)) p = null; }
        catch (e) { res.errors++; if (!res.err) res.err = 'predict: ' + (e && e.message || e); p = null; } }
      const v = judge(it, p);
      if (v === 1) res.correct++; else if (v === -2) res.wrong++; else res.abstain++;
      res.pts += v;
      if (!dead) try { Lr.learn({ answer: it.answer, correct: v === 1, pred: p }); } catch (e) { res.errors++; if (!res.err) res.err = 'learn: ' + (e && e.message || e); }
      win.push(v === 1 ? 1 : 0); if (win.length > CRIT.win) win.shift();
      if (res.steps == null && win.length === CRIT.win && win.reduce((a, b) => a + b, 0) >= CRIT.need) res.steps = i + 1;
      bin[0] += v === 1 ? 1 : 0; bin[1]++;
      if (bin[1] === binN || i === trials - 1) { res.curve.push(+(bin[0] / bin[1]).toFixed(3)); bin = [0, 0]; }
      i++;
      return { i: i - 1, input: it.input, answer: it.answer, pred: p, v, why: Lr && Lr.why };
    },
    abort(msg, at) { res.err = (res.err ? res.err + '; ' : '') + msg; res.abstain += trials - at; i = trials; },
    finish() { try { res.size = Math.max(0, Math.round(+((Lr && Lr.size && Lr.size()) || 0))) || 0; } catch (e) { res.size = 0; } return fin(res, trials); } };
}
export function runStream(factory, stream, { trials = 240, genome = {}, params = {}, budgetMs = 6000, onTrial } = {}) {
  const t0 = Date.now(), st = makeStepper(factory, stream, { trials, genome, params });
  while (!st.done) { const k = st.step(); if (onTrial) onTrial(k); if (Date.now() - t0 > budgetMs) { st.abort(`over compute budget at trial ${k.i + 1}`, k.i + 1); break; } }
  const res = st.finish(); res.ms = Date.now() - t0; return res;
}
function fin(res, trials) {
  res.acc = +(res.correct / trials).toFixed(4);
  res.solved = +Math.max(0, res.pts / trials).toFixed(4);          // fraction solved, net of THE REAPER's -2 per wrong answer
  res.speed = res.steps == null ? 0 : +Math.max(0, 1 - (res.steps - CRIT.win) / (trials - CRIT.win)).toFixed(4);
  return res;
}

/* ---------------- PROBLEM GENERATOR: batteries ----------------
   dev      : the training families, plain, fixed seed. The designers (and the LLM) may look at these.
   selection: every selection family, once plain and once scrambled, with a FRESH seed and a FRESH scramble
              for every generation. Nothing is learned between streams, so no solver has seen the battery.
   sealed   : families never used for selection, plain + scrambled: a final generalization test. */
export function makeBattery(kind, seed) {
  if (kind === 'dev') return TRAIN.map((f, i) => ({ family: f, seed: seed + i, scrambled: false }));
  const fams = kind === 'sealed' ? SEALED : SELECT;
  const out = []; fams.forEach((f, i) => { out.push({ family: f, seed: seed * 97 + i, scrambled: false }); out.push({ family: f, seed: seed * 97 + i + 50, scrambled: true }); });
  return out;
}
export const selectionSeed = gen => 1000 + gen * 13;
export const SEALED_SEED = 9001;

/* ---------------- THE REAPER, per design ----------------
   REAPER SCORE = ( S + Q + X ) / 3, fixed equal weights, nothing else:
     S = fraction solved on the plain streams (net of -2 per wrong answer, floored at 0)
     Q = speed: 1 - (steps to solution - 20)/(trials - 20), 0 if never solved, averaged over all streams
     X = transfer: fraction solved on the SCRAMBLED streams
   No compute bonus, no designer bonus, no LLM opinion. It is the only selection pressure. */
export function evaluate(design, streams, { trials = 240, budgetMs = 6000, onStream, factory } = {}) {
  const fac = factory || compileLearner(design.code);
  const runs = [];
  for (const st of streams) { const r = runStream(fac, st, { trials, genome: design.genome || {}, params: design.params || {}, budgetMs }); runs.push(r); if (onStream) onStream(r, runs.length, streams.length); }
  return reaperScore(runs);
}
export function reaperScore(runs) {
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const plain = runs.filter(r => !r.scrambled), scr = runs.filter(r => r.scrambled);
  const S = mean(plain.map(r => r.solved)), X = scr.length ? mean(scr.map(r => r.solved)) : null, Q = mean(runs.map(r => r.speed));
  const score = X == null ? (S + Q) / 2 : (S + Q + X) / 3;
  const solvedStreams = runs.filter(r => r.steps != null);
  const per = runs.map(r => ({ family: r.family, scrambled: r.scrambled, acc: r.acc, solved: r.solved, steps: r.steps, speed: r.speed, abstain: +(r.abstain / r.trials).toFixed(3), size: r.size, ms: r.ms, curve: r.curve, err: r.err }));
  return {
    score: +score.toFixed(4), S: +S.toFixed(4), Q: +Q.toFixed(4), X: X == null ? null : +X.toFixed(4),
    transferRatio: X == null || S < 0.02 ? null : +(X / S).toFixed(3),
    acc: +mean(runs.map(r => r.acc)).toFixed(4), solvedStreams: solvedStreams.length, streams: runs.length,
    medianSteps: solvedStreams.length ? solvedStreams.map(r => r.steps).sort((a, b) => a - b)[Math.floor(solvedStreams.length / 2)] : null,
    meanSize: Math.round(mean(runs.map(r => r.size))), ms: runs.reduce((a, r) => a + r.ms, 0), per,
  };
}
/* THE REAPER ranks a generation: by REAPER SCORE only (exact ties: higher S, then higher Q, then slot order). */
export function reaperRank(entries) {
  return entries.slice().sort((a, b) => (b.sel.score - a.sel.score) || (b.sel.S - a.sel.S) || (b.sel.Q - a.sel.Q) || (a.order - b.order));
}
