/* NEURO ARENA: the evolvable UNDERSTANDING layer, shared by every contest.
   "Know yourself and know your enemy, and you will always be victorious" (Sun Tzu). The hypothesis being tested:
   intelligence evolves when reflexive shortcuts are limited, so the brain has to build detectors for the structure
   of its world (letters that go together, an opponent's habits, its own recent mistakes).

   The layer is a set of hidden units written in the GENOME (genome.ux.units), not designed by hand:
   - each unit is an AND of 1-3 inputs; an input is a code src*4096 + symbol:
       src 0 / 1 = the contest's two task input slots (e.g. Word completion: the gap position / a letter at a place),
       src 2     = context symbols: KNOW YOURSELF (own last outcome, streak, own last answer, confidence) and
                   KNOW YOUR ENEMY (the opponent's last answer, outcome, who was faster);
   - copy errors rewire inputs (a local move: same letter, neighbouring place, or a random new input), add or drop
     an input, duplicate a unit into another slot (gene duplication) or delete it; hidden-to-hidden links
     (genome.ux.rec) are added and removed the same way;
   - each unit drives the answer populations through ordinary reward-learned synapses (unit-to-motor links are
     switched on/off by the gene bit `o`);
   - THE REFLEX (a unit driven by a single cue of the contest's reflex slot, e.g. the gap position alone, which can
     only learn the position-frequency prior) can be Full, Limited (its synapses capped at 20% and decaying every
     trial: a metabolic cost) or None (no output). genome.ux.reflex = 0 / 1 / 2. */
export const UX_SRC = 4096, UX_MAXIN = 3;
export const REFLEX = ['Full', 'Limited', 'None'];
export const REFLEX_CAP = [1, 0.2, 0];
export const REFLEX_DECAY = [1, 0.99, 0];
export const SUNTZU = 'Know yourself and know your enemy, and you will always be victorious. (Sun Tzu)';
const pick = (r, a) => a[Math.floor(r() * a.length)];

/* the context symbols of a choice contest: [{ name, grp }]. Answers are included only for small answer sets */
export function ctxSyms(C) {
  const s = [], self = n => s.push({ name: n, grp: 'self' }), en = n => s.push({ name: n, grp: 'enemy' });
  ['my last answer was right', 'my last answer was wrong', 'I abstained / first trial'].forEach(self);
  ['I am on a 3+ win streak', 'I won 1-2 in a row', 'I lost 1-2 in a row', 'I am on a 3+ losing streak'].forEach(self);
  ['I was unsure last time', 'I was sure last time'].forEach(self);
  const small = C.K <= 10;
  if (small) C.labels.forEach(l => self(`my last answer: ${l}`));
  ['enemy was right last time', 'enemy was wrong last time', 'enemy answered first', 'I answered first'].forEach(en);
  if (small || C.house) C.labels.forEach(l => en(`enemy's last ${C.house ? 'throw' : 'answer'}: ${l}`));
  return s;
}
export const CX = { RIGHT: 0, WRONG: 1, NONE: 2, ST: 3, UNSURE: 7, SURE: 8, MYANS: 9 };
// context symbol list for one player from its own and the enemy's last results
export function ctxOf(C, me, en) {
  const small = C.K <= 10, o = [], base = 9 + (small ? C.K : 0);
  if (!me || me.c == null) o.push(CX.NONE); else o.push(me.right ? CX.RIGHT : me.c < 0 ? CX.NONE : CX.WRONG);
  if (me && me.streak) o.push(me.streak >= 3 ? 3 : me.streak > 0 ? 4 : me.streak > -3 ? 5 : 6);
  if (me && me.conf != null) o.push(me.conf ? CX.SURE : CX.UNSURE);
  if (small && me && me.c >= 0) o.push(CX.MYANS + me.c);
  if (en && en.c != null) { o.push(base + (en.right ? 0 : 1)); o.push(base + (en.first ? 2 : 3)); if ((small || C.house) && en.c >= 0) o.push(base + 4 + en.c); }
  return o;
}

/* naming a code for the Lab: C.symName(src, sym) for the task slots, the context list for src 2 */
export function codeName(C, code) {
  const src = Math.floor(code / UX_SRC), s = code % UX_SRC;
  if (src === 2) { const x = C.ctx_[s]; return x ? x.name : 'ctx ' + s; }
  return C.symName ? C.symName(src, s) : `${src === 0 ? 'A' : 'B'}=${C.sym ? C.sym[src][s] : s}`;
}
export const unitName = (C, u) => !u || !u.i.length ? 'empty' : u.i.map(c => codeName(C, c)).join(' + ');
// unit class: 'empty', 'reflex', 'self', 'enemy', or the contest's own task classes (C.uClass, default 'task')
export function unitClass(C, u) {
  if (!u || !u.i.length) return 'empty';
  const src = u.i.map(c => Math.floor(c / UX_SRC));
  if (src.includes(2)) { const g = u.i.filter(c => c >= 2 * UX_SRC).map(c => (C.ctx_[c % UX_SRC] || {}).grp); return g.includes('enemy') ? 'enemy' : 'self'; }
  if (u.i.length === 1 && (C.reflexSrc || [0]).includes(src[0])) return 'reflex';
  return C.uClass ? C.uClass(u) : 'task';
}
export function classCounts(C, ux) {
  const n = {}; if (!ux) return n;
  for (const u of ux.units) { const k = unitClass(C, u); n[k] = (n[k] || 0) + 1; }
  return n;
}
// a random input code for contest C (task slots weighted by their size, context by C.ctxW)
function randCode(C, r) {
  const n0 = C.n[0], n1 = C.n[1], nc = C.ctx_.length, w2 = C.ctxW ?? 0.15;
  if (r() < w2) return 2 * UX_SRC + Math.floor(r() * nc);
  if (C.srcs) { const tot = C.srcs.reduce((a, x) => a + x[2], 0); let x = r() * tot; for (const [src, n, w] of C.srcs) { if ((x -= w) <= 0) return src * UX_SRC + Math.floor(r() * n); } const [src, n] = C.srcs[0]; return src * UX_SRC + Math.floor(r() * n); }
  return r() < (C.src0W ?? 0.5) ? Math.floor(r() * n0) : UX_SRC + Math.floor(r() * n1);
}
// a local move of one input: the contest may define C.uLocal(code, r) (e.g. same letter, neighbouring place)
function moveCode(C, code, r) {
  if (C.uLocal && r() < 0.6) { const c = C.uLocal(code, r); if (c != null) return c; }
  return randCode(C, r);
}
/* gen-0 layer: random sparse units (no designed conjunctions). C.uN units; a share C.reflexInit are reflex units
   (one cue of the reflex slot alone), the rest have 2 random inputs; ~10% start empty */
export function initUX(C, seed, reflex = 1) {
  const r = mulberry(seed * 31 + 7), N = C.uN || 160, units = [];
  for (let k = 0; k < N; k++) {
    const x = r();
    if (x < 0.1) units.push({ i: [], o: 1 });
    else if (x < 0.1 + (C.reflexInit ?? 0.05)) { const s = pick(r, C.reflexSrc || [0]); units.push({ i: [s * UX_SRC + Math.floor(r() * C.n[s])], o: 1 }); }
    else { const a = randCode(C, r); let b = randCode(C, r); for (let t = 0; t < 4 && b === a; t++) b = randCode(C, r); units.push({ i: a === b ? [a] : [a, b], o: 1 }); }
  }
  return { units, rec: [], reflex };
}
const key = u => u.i.length ? u.i.slice().sort((a, b) => a - b).join('.') + (u.o ? '' : '!') : '';
export const unitKey = key;
/* copy errors on the layer: each unit is miscopied with probability rate (x C.uRateX); returns a new ux */
export function mutateUX(C, ux, rate, r, errors) {
  const units = ux.units.map(u => ({ i: u.i.slice(), o: u.o })), rec = ux.rec.map(e => e.slice()), pr = rate * (C.uRateX ?? 0.25);
  const note = (k, kind, from) => errors && errors.push({ key: 'units', kind, from, to: unitName(C, units[k]), unit: k });
  for (let k = 0; k < units.length; k++) {
    if (r() >= pr) continue;
    const u = units[k], from = unitName(C, u), x = r();
    if (!u.i.length) { const a = randCode(C, r), b = randCode(C, r); u.i = a === b ? [a] : [a, b]; u.o = 1; note(k, 'new unit', from); continue; }
    if (x < 0.45) { const j = Math.floor(r() * u.i.length); u.i[j] = moveCode(C, u.i[j], r); u.i = [...new Set(u.i)]; note(k, 'rewire', from); }
    else if (x < 0.6) { if (u.i.length < UX_MAXIN) { const c = randCode(C, r); if (!u.i.includes(c)) u.i.push(c); note(k, 'add input', from); } }
    else if (x < 0.72) { if (u.i.length > 1) { u.i.splice(Math.floor(r() * u.i.length), 1); note(k, 'drop input', from); } }
    else if (x < 0.87) { const src = units[Math.floor(r() * units.length)]; if (src.i.length) { u.i = src.i.slice(); if (r() < 0.5) { const j = Math.floor(r() * u.i.length); u.i[j] = moveCode(C, u.i[j], r); u.i = [...new Set(u.i)]; } u.o = 1; note(k, 'duplication', from); } }
    else if (x < 0.95) { u.i = []; note(k, 'deletion', from); }
    else { u.o = u.o ? 0 : 1; note(k, u.o ? 'output on' : 'output off', from); }
  }
  // hidden-to-hidden links
  const nr = rate * units.length * 0.05;
  for (let t = 0; t < 3; t++) if (r() < nr) {
    if (rec.length && r() < 0.4) { const j = Math.floor(r() * rec.length); const e = rec.splice(j, 1)[0]; errors && errors.push({ key: 'rec', kind: 'link removed', from: `${e[0]}→${e[1]}`, to: '' }); }
    else if (rec.length < 200) { const a = Math.floor(r() * units.length), b = Math.floor(r() * units.length); if (a !== b) { rec.push([a, b]); errors && errors.push({ key: 'rec', kind: 'link added', from: '', to: `${a}→${b}` }); } }
  }
  return { units, rec, reflex: ux.reflex };
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
