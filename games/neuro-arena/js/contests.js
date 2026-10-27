/* NEURO ARENA: the contests on the carousel, THE REAPER (the judge), and the trial runner for choice brains.
   Every non-Pong contest is a short-horizon two-player quiz: both brains see the same stimulus at the same moment
   and race to answer by making one of their choice populations win. Answers are strings (e.g. "12", "T") and are
   judged per character. */
import { mulberry32 } from './brain.js';
import { ChoiceBrain } from './cbrain.js';
import { PUZZLE5, DICT5 } from './words5.js';
import { ctxSyms, ctxOf, UX_SRC, initUX, unitClass } from './understand.js';

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
// (smaller steps than before: the last letter, then the last two, then any; pos = the blank positions allowed)
const TXL = [{ n: 25, pos: [4] }, { n: 25, pos: [3, 4] }, { n: 25 }, { n: 80 }, { n: 200 }, { n: W5.length }];
/* the understanding layer for Word completion (understand.js): units over the gap position (src 0) and the
   (place, letter) inputs (src 1). The reflex = the gap position alone (it can only learn S, R, A, E, E: the most
   common letter for each place). Unit classes: 'neighbor' = the gap + a letter right next to it ("Q at 1 + gap at
   2"), 'bigram' = two letters side by side, 'far' = the gap + letters further away, 'letters' / 'cue' otherwise. */
const TX_UX = {
  uOnly: true, uN: 480, reflexSrc: [0], src0W: 0.3, ctxW: 0.06,
  symName: (src, s) => src === 0 ? `gap at ${s + 1}` : `${AZ[s % 26]} at ${Math.floor(s / 26) + 1}`,
  uClass: u => { const gp = u.i.filter(c => c < UX_SRC), lt = u.i.filter(c => c >= UX_SRC && c < 2 * UX_SRC).map(c => c - UX_SRC), q = lt.map(x => Math.floor(x / 26));
    if (gp.length && lt.length) return gp.some(p => q.some(x => Math.abs(x - p) === 1)) ? 'neighbor' : 'far';
    if (lt.length >= 2) return q.some((a, i) => q.some((b, j) => i !== j && Math.abs(a - b) === 1)) ? 'bigram' : 'letters';
    return gp.length > 1 ? 'gaps' : 'cue'; },
  uLocal: (code, r) => { if (code < 5) return Math.max(0, Math.min(4, code + (r() < 0.5 ? -1 : 1)));
    if (code < UX_SRC || code >= 2 * UX_SRC) return null; const x = code - UX_SRC, q = Math.floor(x / 26), l = x % 26;
    if (r() < 0.5) { const q2 = q + (r() < 0.5 ? -1 : 1); return q2 < 0 || q2 > 4 ? null : UX_SRC + q2 * 26 + l; } return UX_SRC + q * 26 + Math.floor(r() * 26); },
  nbrClasses: ['neighbor', 'bigram'],
  // the frozen Understanding probe: puzzles where the position-frequency guess is WRONG (not a valid letter) but the
  // neighbouring letters strongly imply the answer: in the 8,636-word dictionary, the letter(s) next to the gap
  // (both sides when the gap is inside the word) are followed by one letter in >= 60% of words (>= 6 words), and that
  // letter is a valid answer. So the reflex scores 0% here by construction and a neighbour detector can score high.
  probe: () => {
    const items = W5ITEMS, pf = priorOf(TXC()), ctx = new Map();
    for (const w of DICT5) for (let p = 0; p < 5; p++) { const k = p + (p > 0 ? w[p - 1] : '^') + (p < 4 ? w[p + 1] : '$'), m = ctx.get(k) || new Map(); m.set(w[p], (m.get(w[p]) || 0) + 1); ctx.set(k, m); }
    const ok = items.filter(it => { const w = it[4], p = it[0]; if (it[5].includes(AZ[pf(it)])) return false;
      const m = ctx.get(p + (p > 0 ? w[p - 1] : '^') + (p < 4 ? w[p + 1] : '$')); if (!m) return false; let n = 0, bl = '', bv = 0; for (const [l, v] of m) { n += v; if (v > bv) { bv = v; bl = l; } }
      return n >= 6 && bv / n >= 0.6 && it[5].includes(bl); });
    const r = mulberry32(777), a = [...ok]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, 80); },
  probeName: 'neighbour letters imply the answer, the frequency guess is wrong',
  reflexText: 'In Word completion the reflex is “the gap is in place 3, so say A”: the most common letter for that place (S, R, A, E, E), right 25.3% of the time without reading the word.',
  understandText: 'a letter next to the gap, e.g. “Q at 1 + gap at 2” → U, or pairs of letters that go together',
};
const TXC = () => CONTEST.text;
const txName = L => `${TXL[L].n} words · ${!TXL[L].pos ? 'any letter' : TXL[L].pos.length === 1 ? 'last letter' : 'last 2 letters'} missing`;

/* Smallest divisor: given N (2..99,999), answer its smallest divisor > 1, or P if N is prime. Answers: the primes
   2..31, '37+' (a composite whose smallest prime factor is 37 or more, e.g. 9,991 = 97 x 103) and 'P' (prime).
   Sensory preprocessing (disclosed, like a retina doing edge detection): slot 0 = the LAST digit (10 symbols);
   slot 1 = multi-hot (3 on): the tens digit (0-9), the digit sum mod 3 (3 symbols), the alternating digit sum mod 11
   (11 symbols). Association cells are conjunctions [last digit, slot-1 symbol] (240 tiles). What that makes
   learnable: 2 and 5 from the last digit, 3 from (odd last digit, digit sum = 0 mod 3), 11 from the alternating sum;
   7, 13, 17, ... and prime vs '37+' have no feature and can only be guessed (by frequency) except for the 2-digit
   numbers, which the (last digit, tens digit) tiles identify exactly. Item: [last, [syms], answer, '9,991', N] */
const DV_P = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31], DV_L = [...DV_P.map(String), '37+', 'P'];
const spf = n => { if (n % 2 === 0) return 2; for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return d; return n; };
const factorize = n => { const f = []; while (n > 1) { const p = spf(n); f.push(p); n /= p; } return f; };
const fmtN = n => n.toLocaleString('en-US');
const dvClass = n => { const p = spf(n); return p === n ? DV_L.length - 1 : p <= 31 ? DV_P.indexOf(p) : DV_L.length - 2; };
const dvSyms = n => { let ds = 0, alt = 0, sg = 1; for (let m = n; m > 0; m = Math.floor(m / 10)) { const d = m % 10; ds += d; alt += sg * d; sg = -sg; }
  return [Math.floor(n / 10) % 10, 10 + ds % 3, 13 + ((alt % 11) + 11) % 11]; };
const DV_TILES = (() => { const t = []; for (let a = 0; a < 10; a++) for (let b = 0; b < 24; b++) t.push([a, b]); return t; })();
const dvExplain = it => { const n = it[4], f = factorize(n); return f.length === 1 ? `${fmtN(n)} is prime` : `${fmtN(n)} = ${f.map(fmtN).join(' × ')} · smallest divisor ${fmtN(f[0])}`; };

/* Simon: a sequence of L lights (4 colours) is shown, then played back one light per trial (step 1..L). Working
   memory (a modelled buffer, not learned): the sequence is held in position slots, slot 1 = (position q, colour c),
   multi-hot (L on), kept on through the replay; slot 0 = the sequence-position clock (which step is being played
   back). Association cells are conjunctions [clock step p, (q, c)] (6 x 24 = 144 tiles); what the brain must learn
   is to read the slot whose position matches the clock. Item: [p, [q*4+c], colour at p, display, 'RGBYRG', null, L, index] */
const SM_C = ['R', 'G', 'B', 'Y'], SM_E = { R: '🔴', G: '🟢', B: '🔵', Y: '🟡' }, SM_LEN = [3, 4, 5, 6], SM_MAX = 6;
const SM_TILES = (() => { const t = []; for (let p = 0; p < SM_MAX; p++) for (let q = 0; q < SM_MAX * 4; q++) t.push([p, q]); return t; })();
const SM_ITEMS = (() => { const o = []; for (const L of SM_LEN) for (let k = 0; k < 4 ** L; k++) {
  const c = []; for (let q = 0, m = k; q < L; q++, m = Math.floor(m / 4)) c.push(m % 4);
  const str = c.map(i => SM_C[i]).join(''), syms = c.map((ci, q) => q * 4 + ci);
  for (let p = 0; p < L; p++) o.push([p, syms, c[p], `${str.split('').map(ch => SM_E[ch]).join('')} · play light ${p + 1} of ${L}`, str, null, L, o.length]); } return o; })();

/* a contest: K answers (labels), two input slots with n[c] symbols (sym[c] names them for the display),
   all(): every distinct item [x0, x1, answerIndex, display]; items are drawn uniformly from all() */
export const CONTESTS = [
  { id: 'pong', name: 'Pong', icon: '🏓', kind: 'pong', save: 3, blurb: 'Return the ball. A miss gives the other brain the point.' },
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
  { id: 'divisor', name: 'Smallest divisor', icon: '🔢', kind: 'choice', whole: true, blurb: 'What is the smallest number above 1 that divides N? Answer 2, 3, 5, 7 … 31, 37+ (a bigger factor) or P (prime). 2–99, then up to 999, 9,999 and 99,999. Half of all numbers are even, so always answering 2 already gets ~50%.',
    n: [10, 24], split: 0.3, aBias: -4, wSA: 0.35, tiles: DV_TILES, labels: DV_L, rf: [0.35, 0.35], currThr: [0.85, 0.75, 0.72], mixOld: 0.25, trial: { thinkMs: 500 },
    levels: [99, 999, 9999, 99999], inLevel: (it, L) => it[4] <= L, levelName: L => `2–${fmtN(L)}`, explain: dvExplain, chanceOf: () => 1 / DV_L.length,
    baseOf: items => { const c = new Array(DV_L.length).fill(0); for (const it of items) c[it[2]]++; return Math.max(...c) / items.length; },
    all: () => { const o = []; for (let n = 2; n <= 99999; n++) o.push([n % 10, dvSyms(n), dvClass(n), fmtN(n), n]); return o; } },
  { id: 'evenodd', name: 'Even or odd', icon: '🎲', kind: 'choice', hidden: true, blurb: 'Rapid fire: is the number even (E) or odd (O)? 0–9, then 0–99, then 0–999 as the brains pass 80%.',
    n: [10, 10], labels: ['E', 'O'], rf: [0.35, 0.35], marg: 0.4, levels: [9, 99, 999], inLevel: (it, L) => it[4] <= L, levelName: L => `0–${L}`,
    all: () => Array.from({ length: 1000 }, (_, v) => [v % 10, Math.floor(v / 10) % 10, v % 2, String(v), v]) },
  { id: 'text', name: 'Word completion', icon: '🔤', kind: 'choice', save: 7, blurb: `Fill in the missing letter of a five-letter word (L_GHT → I). The gap can be any of the 5 letters; any letter that makes a real word counts (_IGHT → N or L). Starts with 25 words and the last letter missing, grows to all ${PUZZLE5.length} words with any letter missing.`,
    n: [5, 130], split: 0.2, currThr: [0.8, 0.6, 0.42, 0.38, 0.33], mixOld: 0.25, trial: { thinkMs: 700 }, aBias: -4, wSA: 0.35, tiles: W5TILES, labels: AZ, rf: [0.35, 0.35], valid: 5,
    levels: [0, 1, 2, 3, 4, 5], inLevel: (it, L) => it[6] < TXL[L].n && (!TXL[L].pos || TXL[L].pos.includes(it[0])), levelName: txName,
    chanceOf: items => items.reduce((a, it) => a + it[5].length, 0) / items.length / 26, ...TX_UX,
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
  { id: 'simon', name: 'Simon', icon: '🚦', kind: 'choice', seq: true, save: 2, blurb: 'A sequence of coloured lights flashes (red, green, blue, yellow): play it back one light at a time. 3 lights, then 4, 5 and finally 6. THE REAPER scores every light: +1 right colour in the right place, −2 wrong.',
    n: [SM_MAX, SM_MAX * 4], split: 0.2, aBias: -4, wSA: 0.35, tiles: SM_TILES, labels: SM_C, rf: [0.35, 0.35], currThr: [0.8, 0.8, 0.8], mixOld: 0.25, trial: { thinkMs: 400 },
    levels: SM_LEN, inLevel: (it, L) => it[6] === L, levelName: L => `${L} lights`, explain: it => `the sequence was ${it[4].split('').map(c => SM_E[c]).join('')}`,
    all: () => SM_ITEMS },
  { id: 'simon2', name: 'Simon (2 colours)', icon: '🚦', kind: 'choice', hidden: true, blurb: 'Two colours flash in order: repeat the sequence (scored per colour, so half right still earns a point).',
    n: [3, 3], labels: ['RR', 'RG', 'RB', 'GR', 'GG', 'GB', 'BR', 'BG', 'BB'], rf: [0.35, 0.35],
    all: () => { const o = [], L = 'RGB', E = { R: '🔴', G: '🟢', B: '🔵' }; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) o.push([a, b, a * 3 + b, `${E[L[a]]} then ${E[L[b]]}`]); return o; } },
  { id: 'tug', name: 'Tug-of-war reflex', icon: '🪢', kind: 'choice', hidden: true, blurb: 'An arrow flashes; the first brain to pull the right way moves the rope.',
    n: [2, 1], labels: ['◀', '▶'], rf: [0.3, 0.35], race: true,
    all: () => [[0, 0, 0, '◀'], [1, 0, 1, '▶']] },
];
export const CONTEST = Object.fromEntries(CONTESTS.map(c => [c.id, c]));
/* THE UNDERSTANDING LAYER for the other contests: each one's REFLEX (the one cue it can answer from without reading
   the rest) and a frozen probe of real items where that reflex is wrong but the full input decides the answer.
   Contests whose answer is a one-to-one copy of a single input (Echo, Count the dots, Rock paper scissors) have no
   reflex to limit: their units are not capped, and they get the self / enemy layer but no probe. */
const shuf = (a, seed) => { const r = mulberry32(seed), b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const fullOf = C => C.levels ? benchSet(C, C.levels.length - 1) : benchSet(C, 0);
const wrongProbe = (C, keep, n = 40, pool = null) => () => { const pf = priorOf(C); return shuf((pool ? pool() : fullOf(C)).filter((it, i, all) => keep(it) && it[2] !== pf(it) && all.findIndex(x => x[3] === it[3]) === i), 901).slice(0, n); };
const UXDEF = {
  add: { reflexSrc: [0], reflexText: 'In Addition the reflex is “the first number is 3, so say the answer that is most often right after a 3”: it never reads the second number.', understandText: 'the two numbers together, e.g. “3 in slot 1 + 4 in slot 2” → 7',
    probeName: 'sums the first-number guess gets wrong', probe: null },
  sub: { reflexSrc: [0], reflexText: 'In Subtraction the reflex answers from the first number alone.', understandText: 'both numbers together', probeName: 'differences the first-number guess gets wrong' },
  big: { reflexSrc: [0], reflexText: 'In Bigger number the reflex is “the left number is big, so say Left”: right 78% of the time without looking at the right number.', understandText: 'both numbers together, especially close pairs',
    probeName: 'close pairs (differ by 1 or 2) where the left-number guess is wrong', keep: it => Math.abs(it[0] - it[1]) <= 2 },
  divisor: { reflexSrc: [0], reflexText: 'In Smallest divisor the reflex is the last-digit cue (even → 2, ends in 5 → 5, otherwise its usual answer): right 66% of the time.', understandText: 'the digit-sum and other digits beyond the last one (3, 7, 11 …)',
    probeName: 'numbers that need more than the last-digit cue', pool: C => C.all_ },
  evenodd: { reflexSrc: [1], reflexText: 'In Even/odd the tempting cue is the tens digit; the answer depends only on the ones digit.', understandText: 'the ones digit, not the tens digit', probeName: 'numbers whose tens and ones digits differ in parity', keep: it => (it[0] % 2) !== (it[1] % 2) },
  simon: { reflexSrc: [0], reflexText: 'In Simon the reflex is “light 3, so say the colour most often at place 3”: right 26% (chance 25%) without remembering the sequence.', understandText: 'the place in the sequence together with the colour shown there, and repeats',
    probeName: 'steps inside repeated-colour runs, where the place-only guess is wrong', keep: it => it[0] > 0 && it[4] && it[4][it[0]] === it[4][it[0] - 1], pool: C => C.all_.filter((it, i) => i % 7 === 0) },
  pattern: { reflexSrc: [0], reflexText: 'In Pattern completion the reflex answers from the first number of the run alone (right 50%).', understandText: 'the first number together with the step', probeName: 'step-1 runs the first-number guess gets wrong', keep: it => it[1] === 1 },
  echo: { reflexSrc: [] }, dots: { reflexSrc: [] }, rps: { reflexSrc: [] },
};
for (const [id, d] of Object.entries(UXDEF)) { const C = CONTEST[id]; if (!C) continue; const { keep, pool, probe, ...rest } = d; Object.assign(C, rest);
  if (d.probeName) C.probe = wrongProbe(C, keep || (() => true), 40, pool ? () => pool(C) : null); }
for (const c of CONTESTS) if (c.kind === 'choice') { c.K = c.labels.length; c.all_ = c.all(); c.items = c.all_; c.chance = c.chanceOf ? c.chanceOf(c.all_) : 1 / c.K; c.nLevels = c.levels ? c.levels.length : 1; c.ctx_ = ctxSyms(c); }
/* the reflex's guess for an item: the most common (valid) answer given the reflex slot's symbol alone (Word
   completion: the gap position -> S, R, A, E, E). Used for the beyond-reflex metric. */
export function priorOf(C) {
  if (C._prior) return C._prior;
  const src = (C.reflexSrc || [0])[0], cnt = new Map();
  for (const it of C.all_) { const v = String(it[src]), m = cnt.get(v) || new Array(C.K).fill(0); if (C.valid != null && it[C.valid]) { for (const l of it[C.valid]) m[C.labels.indexOf(l)]++; } else m[it[2]]++; cnt.set(v, m); }
  const best = new Map(); for (const [v, m] of cnt) best.set(v, m.indexOf(Math.max(...m)));
  return (C._prior = it => best.get(String(it[src])) ?? 0);
}
// accuracy of the reflex's guess on a set of items (a correct answer under THE REAPER's rule)
export function priorAcc(C, items) { const pf = priorOf(C); let n = 0; for (const it of items) { const j = judgeItem(C, it, pf(it)); if (!j.bad && !j.abst && j.ok === j.max) n++; } return items.length ? n / items.length : 0; }
// the frozen Understanding probe of a contest (C.probe builds it once)
export function probeSet(C) { return C._probe || (C._probe = C.probe ? C.probe() : []); }
// gen-0 understanding layer for a contest's genome (null = designed wiring only)
export function initGenomeUX(C, g, reflex = 1, seed = null) { if (C && (C.kind === 'choice' || C.id === 'pong') && C.ux !== false) g.ux = initUX(C, seed ?? (g.seed | 0), reflex); return g; }
export { unitClass };
// cached reflex scores for the Lab: on the Understanding probe and on the full-task benchmark
export function uPrep(C) { if (!C || !C.probe) return C; const P = probeSet(C); if (C._probePrior == null) C._probePrior = priorAcc(C, P);
  if (C._fullPrior == null) C._fullPrior = priorAcc(C, benchSet(C, C.levels ? C.levels.length - 1 : 0)); return C; }
// the items and chance level of curriculum level lv (contests without levels: all items)
export function itemsAt(C, lv = 0) {
  if (!C.levels) return C.items;
  const L = C.levels[Math.max(0, Math.min(C.levels.length - 1, lv | 0))], key = '_lv' + L;
  return C[key] || (C[key] = C.all_.filter(it => C.inLevel(it, L)));
}
export const chanceAt = (C, lv = 0) => C.kind !== 'choice' ? 0 : C.chanceOf ? C.chanceOf(itemsAt(C, lv)) : C.levels ? 1 / new Set(itemsAt(C, lv).map(it => it[2])).size : C.chance;
// the 'always give the most common answer' score at a level (contests with baseOf, e.g. always 2 for Smallest divisor)
export const baseAt = (C, lv = 0) => { const k = '_base' + (lv | 0); return C[k] ?? (C[k] = C.baseOf(itemsAt(C, lv))); };
export const levelName = (C, lv = 0) => C.levels ? `level ${(lv | 0) + 1}/${C.levels.length} · ${C.levelName(C.levels[Math.min(lv | 0, C.levels.length - 1)])}` : '';
/* lifetime curriculum: advance a level when the rolling accuracy of the last `win` trials reaches `thr`
   (per level C.currThr[level] when the contest has one: the hard levels of Word completion top out near 30-50%) */
export const CURR = { thr: 0.9, win: 60 };
export const levelThr = (C, lv = 0) => C.currThr ? C.currThr[Math.min(lv | 0, C.currThr.length - 1)] : CURR.thr;
// a practice item at level lv: with probability C.mixOld it is a puzzle of the level below (keeps old skills; the
// frozen benchmark still uses the current level only)
export function drawItem(C, lv, rnd) {
  const items = (lv | 0) > 0 && C.mixOld && rnd() < C.mixOld ? itemsAt(C, (lv | 0) - 1) : itemsAt(C, lv);
  return items[Math.floor(rnd() * items.length)];
}
// the trial timing for a contest (C.trial overrides, e.g. a longer THINKING window for Word completion)
export const trialOf = C => ({ ...TRIAL, ...(C && C.trial || {}) });
export class Curriculum {
  constructor(C, level = 0) { this.C = C; this.level = level | 0; this.h = []; this.ups = []; }
  get items() { return itemsAt(this.C, this.level); }
  note(right, t = 0) {
    if (!this.C.levels) return false;
    this.h.push(right ? 1 : 0); if (this.h.length > CURR.win) this.h.shift();
    if (this.h.length >= CURR.win && this.h.reduce((a, b) => a + b, 0) >= levelThr(this.C, this.level) * CURR.win && this.level < this.C.levels.length - 1) { this.level++; this.h = []; this.ups.push(t); return true; }
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
export const ansLen = (C, item) => C.whole ? 1 : C.labels[item[2]].length;
// balanced accuracy: the mean over answer classes present in the set of the fraction of that class answered right
export const balAcc = ([n, r]) => { let s = 0, k = 0; for (let i = 0; i < n.length; i++) if (n[i]) { s += r[i] / n[i]; k++; } return k ? s / k : 0; };
export function judge(given, want) {
  if (given == null) return { s: 0, ok: 0, bad: 0, abst: 1, max: want.length };
  let ok = 0, bad = 0;
  for (let i = 0; i < Math.max(given.length, want.length); i++) { if (i >= given.length) continue; if (given[i] === want[i]) ok++; else bad++; }
  return { s: ok - 2 * bad, ok, bad, abst: 0, max: want.length };
}
// judge an answer index for an item; contests with a `valid` field accept any valid alternative (full credit, j.alt)
export function judgeItem(C, item, c) {
  const want = C.labels[item[2]], given = c >= 0 ? C.labels[c] : null;
  if (C.whole) return given == null ? { s: 0, ok: 0, bad: 0, abst: 1, max: 1 } : given === want ? { s: 1, ok: 1, bad: 0, abst: 0, max: 1 } : { s: -2, ok: 0, bad: 1, abst: 0, max: 1 };
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
    this.C = contest; this.P = players; this.next = next; this.T = { ...TRIAL, ...(contest.trial || {}), ...opts }; this.learn = opts.learn !== false;
    this.t = 0; this.phase = 'iti'; this.pt = this.T.iti; this.trials = 0; this.events = []; this.item = null; this.onJudge = opts.onJudge || null;
    const n = players.length; this.n = n; this.hasHuman = players.some(p => p.human);
    this.st = { score: Array(n).fill(0), ok: Array(n).fill(0), bad: Array(n).fill(0), abst: Array(n).fill(0), right: Array(n).fill(0), alt: Array(n).fill(0), first: Array(n).fill(0), lat: Array(n).fill(0), latN: Array(n).fill(0) };
    this.seg = []; this.segAcc = { r: Array(n).fill(0), n: 0, t: 0 };
    this.hist = players.map(() => ({ c: null, right: false, streak: 0, conf: null, first: false }));   // KNOW YOURSELF / YOUR ENEMY inputs
  }
  get acceptAt() { return this.T.presentMs + this.T.thinkMs; }
  startTrial() {
    // sequence contests (Simon): the steps of one sequence are played back in order, then a new sequence is drawn
    const pv = this.item, C = this.C;
    if (C.seq && !this.T.fixed && pv && pv[0] < pv[6] - 1) this.item = C.all_[pv[7] + 1];
    else { this.item = this.next(this.trials); if (C.seq && !this.T.fixed && this.item[0] > 0) this.item = C.all_[this.item[7] - this.item[0]]; }
    this.phase = 'present'; this.pt = 0;
    this.out = this.P.map(() => ({ c: -1, t: null, cnt: null })); this.done = new Uint8Array(this.n); this.until = new Int32Array(this.n);
    this.P.forEach((p, k) => { if (!p.brain) return; p.brain.quiesce(); p.brain.sense(this.item[0], this.item[1]);
      if (p.brain.ux) p.brain.senseCtx(ctxOf(C, this.hist[k], this.n > 1 ? this.hist[1 - k] : null).concat(C.itemCtx ? C.itemCtx(this.item) : []));
      p.brain.commit(-1); });
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
    const C = this.C, want = C.whole ? '·' : C.labels[this.item[2]], st = this.st, res = [];
    for (let k = 0; k < this.n; k++) {
      const o = this.out[k]; const j = o.j || judge(null, want); o.j = j; res.push(o);
      st.score[k] += j.s; st.ok[k] += j.ok; st.bad[k] += j.bad; st.abst[k] += j.abst; const right = !j.bad && !j.abst && j.ok === j.max; if (right) { st.right[k]++; this.segAcc.r[k]++; if (j.alt) st.alt[k]++; }
      if (o.t != null) { st.lat[k] += o.t; st.latN[k]++; }
    }
    const rt = res.map(o => !o.j.bad && !o.j.abst && o.j.ok === o.j.max ? o.t : Infinity), fk = rt.indexOf(Math.min(...rt));
    if (rt[fk] < Infinity) st.first[fk]++;
    res.forEach((o, k) => { const h = this.hist[k], right = !o.j.bad && !o.j.abst && o.j.ok === o.j.max, b = this.P[k].brain;
      h.c = o.c; h.right = right; h.first = rt[fk] < Infinity && fk === k; h.conf = o.conf != null && b ? o.conf >= b.margin : null;
      if (o.c >= 0) h.streak = right ? (h.streak > 0 ? h.streak + 1 : 1) : (h.streak < 0 ? h.streak - 1 : -1); });
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
  const m = new ChoiceMatch(contest, brains.map(b => ({ brain: b })), () => item, { fixed: true, ...opts });   // exactly this item (no sequence continuation)
  m.pt = m.T.iti; while (m.trials < 1) m.stepMs(1);
  while (m.pt < m.T.iti) m.stepMs(1);
  return m.events[0].res.map(o => ({ c: o.c, t: o.t, conf: o.conf, da: o.da, cnt: o.cnt, j: { s: o.s, ok: o.ok, bad: o.bad, abst: o.abst, alt: o.alt, max: ansLen(contest, item) } }));
}
export function makeBrain(contest, genome, weights, size, frozen = false, opts = {}) {
  const g = frozen ? { ...genome, eta: 0, homeo: 0 } : genome, ux = genome.ux || null;
  const b = new ChoiceBrain(g, { ux, nCx: ux ? contest.ctx_.length : 0, uOnly: !!(ux && contest.uOnly), reflexSrc: contest.reflexSrc, silence: opts.silence, K: contest.K, n: contest.n, rf: contest.rf, marg: contest.marg || 0, tiles: contest.tiles, mtiles: contest.mtiles, mfrac: contest.mfrac, mW: contest.mW, wSlot: contest.wSlot, split: contest.split, aBias: contest.aBias, wSA: contest.wSA, size }, weights);
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
  if (contest.seq) {   // whole sequences in order: random sequences of the level (seeded), every step, <= BENCH_CAP steps
    const src = itemsAt(contest, level).filter(x => x[0] === 0), r = mulberry32(9001), it = [];
    while (it.length + src[0][6] <= BENCH_CAP) { const st = src[Math.floor(r() * src.length)]; for (let p = 0; p < st[6]; p++) it.push(contest.all_[st[7] + p]); }
    return (benchCache[key] = it);
  }
  const src = itemsAt(contest, level), r = mulberry32(9001), it = []; for (let k = 0; k < (src.length <= BENCH_CAP / 2 ? BENCH_REPS : 1); k++) it.push(...src);
  for (let i = it.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [it[i], it[j]] = [it[j], it[i]]; }
  if (it.length > BENCH_CAP) it.length = BENCH_CAP;
  return (benchCache[key] = it);
}
export function choiceBenchmark(contest, genome, weights, size, level = 0, set = null, opts = {}) {
  const b = makeBrain(contest, genome, weights, size, true, opts); set = set || benchSet(contest, level);
  const m = new ChoiceMatch(contest, [{ brain: b }], i => set[i], { learn: false, iti: 20, fixed: true }); const vec = [];
  const pos = contest.seq ? [new Array(SM_MAX).fill(0), new Array(SM_MAX).fill(0)] : null; let sqN = 0, sqOK = 0, sqF = 1;
  let max = 0, i0 = 0; const cls = contest.baseOf ? [new Array(contest.K).fill(0), new Array(contest.K).fill(0)] : null;
  while (m.trials < set.length) { m.stepMs(1); if (m.events.length && m.trials > i0) { const e = m.events[m.events.length - 1]; vec.push(e.res[0].s); max += ansLen(contest, e.item); i0 = m.trials; if (pos) { const ok = e.res[0].ok === 1 && !e.res[0].bad && !e.res[0].abst, p = e.item[0]; pos[0][p]++; pos[1][p] += ok; sqF = (p === 0 ? 1 : sqF) & ok; if (p === e.item[6] - 1) { sqN++; sqOK += sqF; } } if (cls) { cls[0][e.item[2]]++; if (e.res[0].ok === ansLen(contest, e.item) && !e.res[0].bad && !e.res[0].abst) cls[1][e.item[2]]++; } } }
  const st = m.stats();
  return { fit: st.score[0] / max, score: st.score[0], correct: st.ok[0], wrong: st.bad[0], abstain: st.abst[0], max, n: set.length, acc: st.right[0] / set.length, alt: st.alt[0], bal: cls ? balAcc(cls) : null, posAcc: pos ? pos[1].map((v, i) => pos[0][i] ? v / pos[0][i] : null).filter(v => v != null) : null, seqAcc: pos ? (sqN ? sqOK / sqN : 0) : null, base: contest.baseOf ? contest.baseOf(set) : null, lat: st.lat[0], vec, level: contest.levels ? level | 0 : null };
}
// a duel: both brains learn while they race on the same random items for matchSec seconds of simulated time
export function runChoiceDuel(job) {
  const C = CONTEST[job.contest], size = job.size || 2800;
  const A = makeBrain(C, job.gA, job.wA, size), B = makeBrain(C, job.gB, job.wB, size), r = mulberry32(job.seed);
  const m = new ChoiceMatch(C, [{ brain: A }, { brain: B }], () => drawItem(C, job.level, r));
  // the champion's synapses as they were before this duel, on the FULL task (the last level): tracks progress on the
  // real problem even while the curriculum benchmark restarts at every level
  const cg = job.side === 0 ? job.gA : job.gB, cw = job.side === 0 ? job.wA : job.wB;
  const probe = job.probe != null ? choiceBenchmark(C, cg, cw, size, job.probe) : null;
  // the frozen Understanding probe (and, when asked, the ablations) for the champion's pre-duel synapses
  const up = job.uprobe && probeSet(C).length ? understandingReport(C, cg, cw, size, job.ablate) : null;
  m.stepMs(Math.round(job.matchSec * 1000));
  const st = m.stats(); st.score = [...st.score];
  const wA = A.exportWeights(), wB = B.exportWeights();
  const bench = job.bench === false ? null : [choiceBenchmark(C, job.gA, wA, size, job.level), choiceBenchmark(C, job.gB, wB, size, job.level)];
  return { id: job.id, stats: st, wA: job.lamarck ? wA : null, wB: job.lamarck ? wB : null, bench, probe: probe && { acc: probe.acc, alt: probe.alt, level: probe.level }, up };
}
/* Understanding probe accuracy (+ ablations: knock out unit classes and re-measure the probe and the full task).
   ablate: true -> 'all units', 'self', 'enemy', 'self+enemy', the contest's neighbour classes, 'reflex' */
export function understandingReport(C, g, w, size, ablate = false) {
  const P = probeSet(C), out = { acc: choiceBenchmark(C, g, w, size, 0, P).acc, n: P.length, prior: priorAcc(C, P) };
  if (ablate && g.ux) {
    const full = benchSet(C, C.levels ? C.levels.length - 1 : 0), cls = g.ux.units.map(u => unitClass(C, u));
    const kos = { 'none': () => false, 'all units': () => true, 'self': u => cls[u] === 'self', 'enemy': u => cls[u] === 'enemy', 'self+enemy': u => cls[u] === 'self' || cls[u] === 'enemy', 'reflex': u => cls[u] === 'reflex' };
    if (C.nbrClasses) kos['neighbour detectors'] = u => C.nbrClasses.includes(cls[u]);
    out.ablate = {}; out.fullPrior = priorAcc(C, full); out.units = g.ux.units; out.readout = makeBrain(C, g, w, size, true).unitReadout();
    for (const [k, f] of Object.entries(kos)) { const o = { silence: f }; out.ablate[k] = { probe: choiceBenchmark(C, g, w, size, 0, P, o).acc, full: choiceBenchmark(C, g, w, size, C.levels ? C.levels.length - 1 : 0, null, o).acc }; }
  }
  return out;
}
