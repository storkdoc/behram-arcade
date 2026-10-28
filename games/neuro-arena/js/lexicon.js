/* NEURO ARENA: the GROWING LEXICON for Word completion.
   Before (to Oct 28 2026) the puzzles came from a fixed list (the first n of 643 words for each curriculum level), so
   a brain could pass by memorising those words. Now the words practised in the duels come from an ACTIVE POOL that
   changes every generation:
   - SOURCE = the 643 curated words (same seeded order as before) followed by 2,014 more common words (COMMON5,
     most frequent first): 2,657 words. 300 of them are HELD OUT and never trained: 100 curated words of rank >= 200
     and 200 of the extra words (seeded picks). They are the generalisation test.
   - Every word shown in a duel is counted (times shown, and whether the champion got it right, with an EMA of its
     accuracy). After each generation a word RETIRES when it has been shown >= 24 times and the champion's EMA
     accuracy on it is >= 70% (learned), or when it has been shown >= 60 times (over-used). Retired words are only
     reviewed: 20% of draws, uniformly. Inside the pool, a word's draw weight is 1 / (1 + shown/12), so repeats fade.
   - Then never-seen words are ADMITTED in source order: >= 3 per generation, and the pool grows by 3 per generation
     up to the level's cap (40, 40, 60, 150, 400, unlimited for curriculum levels 1-6). At the cap, the most-shown
     active words are retired to make room, so new words still arrive every generation.
   - The curriculum levels still set where the gap may be (last letter, last two, any) and still mix in 25% of
     puzzles from the level below (now: the level below's gap positions). The frozen level benchmarks THE REAPER
     selects on are unchanged (the first n curated words), so saves, thresholds and verdicts keep their meaning.
   - Every 10 generations the champion (frozen synapses) is tested on 100 puzzles of HELD-OUT words and on 100
     puzzles of its 50 most-practised words, with the current level's gap positions: new vs familiar accuracy. A big
     gap = memorisation; no gap = rules that transfer. */
import { mulberry32 } from './brain.js';
import { PUZZLE5, COMMON5, DICT5 } from './words5.js';

export const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const shuffle = (a, seed) => { const r = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const W5 = shuffle([...PUZZLE5], 55);
const P5 = new Set(PUZZLE5);
export const SRC = W5.concat(COMMON5.filter(w => !P5.has(w)));   // rank = index here (curated ranks unchanged)
// curriculum: few words with the LAST letter missing -> few words, any position -> more words -> all words, any position
export const TXL = [{ n: 25, pos: [4] }, { n: 25, pos: [3, 4] }, { n: 25 }, { n: 80 }, { n: 200 }, { n: W5.length }];
export const LEX = { start: 25, admit: 3, cap: [40, 40, 60, 150, 400, Infinity], retireN: 24, retireAcc: 0.7, overN: 60, review: 0.2, decay: 12, ema: 0.15,
  freshN: 3, famN: 20, heldW5: 100, heldX: 200, testN: 100, famWords: 50, testEvery: 10, hist: 800 };
// held-out words: never admitted
export const HELD = (() => { const a = shuffle(Array.from({ length: W5.length - 200 }, (_, k) => 200 + k), 9191).slice(0, LEX.heldW5);
  const b = shuffle(Array.from({ length: SRC.length - W5.length }, (_, k) => W5.length + k), 9292).slice(0, LEX.heldX); return a.concat(b).sort((x, y) => x - y); })();
const HSET = new Set(HELD);
export const ADMIT = SRC.map((_, k) => k).filter(k => !HSET.has(k));   // admission order
export const RANK = new Map(SRC.map((w, k) => [w, k]));
// the puzzle item: [gap position, (place, letter) symbols, answer, 'L_GHT', word, valid letters, rank]
const IT = new Map();
export function itemOf(rk, p) { const key = rk * 5 + p; let it = IT.get(key); if (it) return it; const w = SRC[rk], syms = [];
  for (let q = 0; q < 5; q++) if (q !== p) syms.push(q * 26 + AZ.indexOf(w[q]));
  const valid = AZ.filter(c => DICT5.has(w.slice(0, p) + c + w.slice(p + 1))).join('');
  it = [p, syms, AZ.indexOf(w[p]), w.slice(0, p) + '_' + w.slice(p + 1), w, valid, rk]; IT.set(key, it); return it; }
const posOf = lv => TXL[Math.max(0, Math.min(TXL.length - 1, lv | 0))].pos || [0, 1, 2, 3, 4];
const capOf = lv => LEX.cap[Math.max(0, Math.min(LEX.cap.length - 1, lv | 0))];

export function lexNew(level = 0) {
  const n = Math.min(capOf(level), Math.max(LEX.start, TXL[level | 0] ? TXL[level | 0].n : LEX.start));
  const lx = { v: 1, cyc: 0, next: 0, act: [], ret: [], s: {}, newN: 0, retN: 0, h: [], test: null };
  admit(lx, n); lx.newN = 0; return lx;
}
function admit(lx, k) { let a = 0; while (a < k && lx.next < ADMIT.length) { const rk = ADMIT[lx.next++]; lx.act.push(rk); lx.s[rk] = lx.s[rk] || [0, 0, 0]; a++; } lx.newN += a; return a; }
// the compact pool a worker needs to draw puzzles
export function lexJob(lx) { return { act: lx.act.slice(), wt: lx.act.map(rk => 1 / (1 + (lx.s[rk] ? lx.s[rk][0] : 0) / LEX.decay)), ret: lx.ret.slice() }; }
export function lexDraw(J, lv, rnd, mixOld = 0.25) {
  const pos = (lv | 0) > 0 && rnd() < mixOld ? posOf((lv | 0) - 1) : posOf(lv);
  let rk;
  if (J.ret.length && rnd() < LEX.review) rk = J.ret[Math.floor(rnd() * J.ret.length)];
  else { if (!J.tot) J.tot = J.wt.reduce((a, b) => a + b, 0); let u = rnd() * J.tot, i = 0; while (i < J.act.length - 1 && (u -= J.wt[i]) > 0) i++; rk = J.act[i]; }
  return itemOf(rk, pos[Math.floor(rnd() * pos.length)]);
}
/* end of a generation (or a batch of K parallel ones): fold in the per-word counts the duels returned
   (wd = { WORD: [shown, champion right] }), retire, admit. Returns this cycle's numbers. */
export function lexUpdate(lx, wds, lv, gen, nGen = 1) {
  const c = { fresh: [0, 0], fam: [0, 0], trials: 0, rep: 0, newN: 0, retN: 0 };
  for (const wd of wds) for (const [w, [n, ok]] of Object.entries(wd || {})) { const rk = RANK.get(w); if (rk == null || !n) continue;
    const s = lx.s[rk] || (lx.s[rk] = [0, 0, 0]), n0 = s[0];
    if (n0 < LEX.freshN) { c.fresh[0] += n; c.fresh[1] += ok; } if (n0 >= LEX.famN) { c.fam[0] += n; c.fam[1] += ok; c.rep += n; }
    c.trials += n; s[0] += n; s[1] += ok; const a = 1 - Math.pow(1 - LEX.ema, n); s[2] = +(s[2] + a * (ok / n - s[2])).toFixed(3); }
  lx.newN = 0; const size0 = lx.act.length, cap = capOf(lv);
  if (lx.static) { lx.cyc++; lx.h.push({ gen, act: TXL[lv | 0].n, seen: Object.keys(lx.s).filter(k => lx.s[k][0] > 0).length, ret: 0, newN: 0, retN: 0, trials: c.trials, rep: c.trials ? +(c.rep / c.trials).toFixed(3) : 0,
    fresh: c.fresh[0] ? +(c.fresh[1] / c.fresh[0]).toFixed(3) : null, freshN: c.fresh[0], fam: c.fam[0] ? +(c.fam[1] / c.fam[0]).toFixed(3) : null, famN: c.fam[0] }); if (lx.h.length > LEX.hist) lx.h.splice(0, lx.h.length - LEX.hist); return lx.h[lx.h.length - 1]; }
  const keep = [], gone = []; for (const rk of lx.act) { const s = lx.s[rk]; if ((s[0] >= LEX.retireN && s[2] >= LEX.retireAcc) || s[0] >= LEX.overN) gone.push(rk); else keep.push(rk); }
  const target = Math.min(cap, Math.max(size0, keep.length) + LEX.admit * nGen), need = Math.max(LEX.admit * nGen, target - keep.length);
  if (keep.length + need > cap) { keep.sort((a, b) => lx.s[b][0] - lx.s[a][0]); gone.push(...keep.splice(0, keep.length + need - cap)); }
  lx.act = keep; lx.ret.push(...gone); c.retN = gone.length; lx.retN = gone.length;
  admit(lx, need); c.newN = lx.newN; lx.cyc++;
  const seen = lx.act.length + lx.ret.length;
  lx.h.push({ gen, act: lx.act.length, seen, ret: lx.ret.length, newN: c.newN, retN: c.retN, trials: c.trials, rep: c.trials ? +(c.rep / c.trials).toFixed(3) : 0,
    fresh: c.fresh[0] ? +(c.fresh[1] / c.fresh[0]).toFixed(3) : null, freshN: c.fresh[0], fam: c.fam[0] ? +(c.fam[1] / c.fam[0]).toFixed(3) : null, famN: c.fam[0] });
  if (lx.h.length > LEX.hist) lx.h.splice(0, lx.h.length - LEX.hist);
  return lx.h[lx.h.length - 1];
}
// the new-vs-familiar test sets at a level: 100 puzzles of held-out words; 100 of the 50 most-shown words (seeded)
export function lexTests(lx, lv) {
  const pos = posOf(lv), r = mulberry32(31337 + (lv | 0)), pick = (words, n) => { const all = []; for (const rk of words) for (const p of pos) all.push(itemOf(rk, p)); return shuffle(all, 4711 + (lv | 0)).slice(0, n); };
  const fam = Object.keys(lx.s).map(Number).filter(rk => lx.s[rk][0] > 0).sort((a, b) => lx.s[b][0] - lx.s[a][0] || a - b).slice(0, LEX.famWords);
  void r; return { held: pick(HELD, LEX.testN), fam: pick(fam, LEX.testN), famWords: fam.length };
}
export function lexSummary(lx) { if (!lx) return null; const l = lx.h[lx.h.length - 1] || {}; return { active: lx.act.length, seen: lx.act.length + lx.ret.length, retired: lx.ret.length, newThisCycle: l.newN ?? 0, retiredThisCycle: l.retN ?? 0,
  repeatShare: l.rep ?? null, source: SRC.length, held: HELD.length, unseen: ADMIT.length - lx.next, cycles: lx.cyc }; }
