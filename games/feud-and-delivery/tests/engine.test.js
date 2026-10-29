// node games/feud-and-delivery/tests/engine.test.js
'use strict';
const assert = require('assert');
const E = require('../js/engine.js');
const { ROUNDS } = require('../js/rounds.js');
const byId = id => ROUNDS.find(r => r.id === id);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('round bank is well-formed (>=40 rounds, sums 100, ranked, 4-6 answers)', () => {
  assert.ok(ROUNDS.length >= 40, 'rounds ' + ROUNDS.length);
  const ids = new Set();
  for (const r of ROUNDS) {
    assert.ok(!ids.has(r.id), 'dup id ' + r.id); ids.add(r.id);
    assert.ok(r.a.length >= 4 && r.a.length <= 6, r.id);
    assert.strictEqual(r.a.reduce((s, a) => s + a[1], 0), 100, r.id + ' sum');
    for (let i = 1; i < r.a.length; i++) assert.ok(r.a[i][1] <= r.a[i - 1][1], r.id + ' order');
    assert.ok(r.basis && r.basis.length > 20, r.id + ' basis');
    for (const a of r.a) { assert.ok(a[3] && a[3].length > 10, r.id + ' pearl'); assert.ok(a[0].length <= 40, a[0]); }
  }
});

t('every label and synonym matches its own slot', () => {
  let bad = [];
  for (const r of ROUNDS) r.a.forEach((a, i) => [a[0], ...a[2]].forEach(s => {
    const m = E.match(r, s, []);
    if (m.type !== 'hit' || m.idx !== i) bad.push(`${r.id}: "${s}" -> ${m.type}${m.idx != null ? ' ' + r.a[m.idx][0] : ''}`);
  }));
  assert.deepStrictEqual(bad, []);
});

t('no gag key is a board answer anywhere (gags never sit on the board)', () => {
  const bad = [];
  for (const g of E.GAGS) for (const k of g.keys) for (const r of ROUNDS) {
    const m = E.match(r, k, []);
    if (m.type === 'hit' && E.normalize(k).length > 4) {
      // allowed only when a real clinical synonym legitimately uses the word (e.g. walking = VTE ambulation mnemonic, caffeine as stimulant)
      if (!['walking', 'pass', 'insurance', 'curry', 'debt', 'chocolate'].includes(E.normalize(k))) bad.push(r.id + ':' + k + '->' + r.a[m.idx][0]);
    }
  }
  assert.deepStrictEqual(bad, []);
});

t('matching: synonyms, typos, case, plurals, accents, partials', () => {
  const r = byId('tri3-bleed');
  assert.deepStrictEqual(E.match(r, 'ABRUPTION', []).idx, 1);
  assert.strictEqual(E.match(r, 'placentl abruptoin', []).idx, 1);
  assert.strictEqual(E.match(r, 'previa', []).idx, 2);
  assert.strictEqual(E.match(r, 'placenta praevia', []).idx, 2);
  assert.strictEqual(E.match(r, 'vasa previa!', []).idx, 5);
  assert.strictEqual(E.match(r, 'I think it is a uterine rupture', []).idx, 4);
  const d = byId('discharge');
  assert.strictEqual(E.match(d, 'Bacterial Vaginosis', []).idx, 0);
  assert.strictEqual(E.match(d, 'yeast infections', []).idx, 1);
  assert.strictEqual(E.match(d, 'trichomoniasis', []).idx, 2);
  assert.strictEqual(E.match(d, 'trichomonas vaginalis', []).idx, 2);
  const p = byId('pph-4t');
  assert.strictEqual(E.match(p, 'uterine atony', []).idx, 0);
  assert.strictEqual(E.match(p, 'retained placenta', []).type, 'hit');
  const h = byId('hirsutism');
  assert.strictEqual(E.match(h, "Cushing's", []).idx, 5);
  assert.strictEqual(E.match(h, 'pcos', []).idx, 0);
  assert.strictEqual(E.match(byId('amen-2'), 'Ashermann', []).idx, 5);
  assert.strictEqual(E.match(byId('amen-1'), 'Müllerian agenesis', []).idx, 1);
});

t('misses, dupes, empties and gags', () => {
  const r = byId('tri1-bleed');
  assert.strictEqual(E.match(r, 'gout', []).type, 'miss');
  assert.strictEqual(E.match(r, 'appendicitis', []).type, 'miss');
  assert.strictEqual(E.match(r, '   ', []).type, 'empty');
  assert.strictEqual(E.match(r, 'ectopic', [false, true]).type, 'dupe');
  const g = E.match(r, 'Mercury in retrograde', []);
  assert.strictEqual(g.type, 'gag'); assert.strictEqual(g.gag.id, 'mercury');
  assert.strictEqual(E.match(r, 'too much greys anatomy', []).gag.id, 'greys');
  assert.strictEqual(E.match(r, "Grey's Anatomy", []).gag.id, 'greys');
  assert.strictEqual(E.match(r, 'WebMD said so', []).gag.id, 'webmd');
  assert.strictEqual(E.match(r, 'chat gpt', []).gag.id, 'ai');
  assert.strictEqual(E.match(r, 'its a zebra', []).gag.id, 'zebra');
  // host override
  assert.deepStrictEqual(E.match(r, { idx: 3 }, []).type, 'hit');
  assert.deepStrictEqual(E.match(r, { strike: true }, []).type, 'miss');
});

function play(id, mult) { return new E.Round(byId(id), mult || 1); }

t('face-off: #1 answer wins outright', () => {
  const R = play('tri3-bleed');
  assert.ok(R.buzz(1)); assert.ok(!R.buzz(0));
  const o = R.faceoffAnswer('bloody show');
  assert.strictEqual(o.decided, 1); assert.strictEqual(R.phase, 'playOrPass'); assert.strictEqual(R.bank, 32);
});

t('face-off: higher-ranked answer wins; both miss = again', () => {
  let R = play('tri3-bleed'); R.buzz(0);
  let o = R.faceoffAnswer('previa'); assert.strictEqual(o.decided, null);
  assert.strictEqual(R.faceoffTurn(), 1);
  o = R.faceoffAnswer('abruption'); assert.strictEqual(o.decided, 1); assert.strictEqual(R.bank, 46);
  R = play('tri3-bleed'); R.buzz(0); R.faceoffAnswer('vasa previa'); o = R.faceoffAnswer('gout');
  assert.strictEqual(o.decided, 0);
  R = play('tri3-bleed'); R.buzz(0); R.faceoffAnswer('gout'); o = R.faceoffAnswer('vasa previa');
  assert.strictEqual(o.decided, 1);
  R = play('tri3-bleed'); R.buzz(1); R.faceoffAnswer('gout'); o = R.faceoffAnswer('mercury retrograde');
  assert.ok(o.again); assert.strictEqual(R.phase, 'faceoff'); assert.strictEqual(R.fo.first, null); assert.strictEqual(R.bank, 0);
  // dupe in face-off = retry, not a loss
  R = play('tri3-bleed'); R.buzz(0); R.faceoffAnswer('previa'); o = R.faceoffAnswer('placenta previa');
  assert.ok(o.retry); assert.strictEqual(R.faceoffTurn(), 1);
});

t('play/pass, strikes, steal success (bank + stolen answer, x2 multiplier)', () => {
  const R = play('tri3-bleed', 2); R.buzz(0); R.faceoffAnswer('abruption'); R.faceoffAnswer('gout');
  assert.strictEqual(R.choose(false), 1);         // team 0 passes -> team 1 controls
  let o = R.playAnswer('bloody show'); assert.ok(!o.strike);
  o = R.playAnswer('bloody show'); assert.ok(o.retry); assert.strictEqual(R.strikes, 0);   // duplicate = try again, no strike
  R.playAnswer('gout'); R.playAnswer('WebMD'); o = R.playAnswer('lupus');
  assert.strictEqual(o.strikes, 3); assert.strictEqual(o.toSteal, 0); assert.strictEqual(R.phase, 'steal');
  o = R.stealAnswer('placenta previa');
  assert.ok(o.stolen); assert.strictEqual(R.winner, 0);
  assert.strictEqual(R.bank, 26 + 32 + 20); assert.strictEqual(R.awarded, 156);
});

t('steal failure gives the bank to the controlling side', () => {
  const R = play('pph-4t'); R.buzz(1); R.faceoffAnswer('atony');
  R.choose(true); R.playAnswer('x'); R.playAnswer('y'); R.playAnswer('z');
  const o = R.stealAnswer('nope');
  assert.ok(!o.stolen); assert.strictEqual(R.winner, 1); assert.strictEqual(R.awarded, 68);
});

t('clearing the board wins the round without a steal', () => {
  const r = byId('iud-strings'); const R = new E.Round(r, 3); R.buzz(0); R.faceoffAnswer('retracted strings'); R.choose(true);
  let o; for (let i = 1; i < r.a.length; i++) o = R.playAnswer(r.a[i][0]);
  assert.ok(o.done); assert.strictEqual(R.winner, 0); assert.strictEqual(R.awarded, 300);
});

t('match: multipliers 1,1,2,3, commit, over, sudden death on a tie', () => {
  const M = new E.Match({ names: ['A', 'B'] });
  assert.deepStrictEqual(E.MULT, [1, 1, 2, 3]);
  const mults = [];
  for (let k = 0; k < 4; k++) {
    const R = M.start(ROUNDS[k]); mults.push(R.mult); R.buzz(k % 2); R.faceoffAnswer(ROUNDS[k].a[0][0]); R.choose(true);
    ROUNDS[k].a.slice(1).forEach(a => R.playAnswer(a[0])); M.commit();
  }
  assert.deepStrictEqual(mults, [1, 1, 2, 3]);
  assert.deepStrictEqual(M.scores, [300, 400]); assert.ok(M.over()); assert.strictEqual(M.leader(), 1);
  const T = new E.Match(); T.scores = [100, 100]; T.history = [{}, {}, {}, {}]; T.idx = 3;
  assert.ok(T.needsSudden()); const S = T.start(ROUNDS[5]); assert.ok(T.sudden); S.buzz(0); S.faceoffAnswer(ROUNDS[5].a[1][0]); S.faceoffAnswer('gout');
  T.commitSudden(); assert.ok(T.over()); assert.strictEqual(T.leader(), 0);
});

t('fast money: scoring, seat-2 duplicate try-again, pass, target 200', () => {
  const prompts = ['tri3-bleed', 'pph-4t', 'discharge', 'hirsutism', 'incontinence'].map(byId);
  const F = new E.FastMoney(prompts);
  assert.strictEqual(F.submit(0, 0, 'abruption').pts, 26);
  assert.strictEqual(F.submit(0, 1, 'atony').pts, 68);
  F.pass(0, 2); assert.deepStrictEqual(F.open(0), [2, 3, 4]);
  assert.strictEqual(F.submit(0, 2, 'mercury retrograde').type, 'gag');
  assert.strictEqual(F.submit(0, 3, 'pcos').pts, 70);
  assert.strictEqual(F.submit(0, 4, 'qwerty').pts, 0);
  assert.strictEqual(F.seatTotal(0), 164);
  assert.strictEqual(F.submit(1, 0, 'placental abruption').type, 'dupe');
  assert.strictEqual(F.submit(1, 0, 'bloody show').pts, 32);
  assert.strictEqual(F.submit(1, 1, 'trauma').pts, 20);
  assert.strictEqual(F.total(), 216); assert.ok(F.won());
});

t('rival: buzz windows by level, guesses are open slots or real misses', () => {
  let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const lv of ['easy', 'normal', 'hard']) {
    const d = E.rivalBuzzDelay(lv, rng); assert.ok(d >= E.LEVELS[lv].buzz[0] && d <= E.LEVELS[lv].buzz[1]);
  }
  const r = byId('tri1-bleed'); const rev = [true, false, false, false, false, false];
  const pool = E.vocab(ROUNDS); let hits = 0;
  for (let i = 0; i < 400; i++) {
    const g = E.rivalGuess(r, rev, 'hard', rng, pool);
    const m = E.match(r, g.text, rev);
    if (g.idx === null) assert.notStrictEqual(m.type, 'hit', g.text); else { assert.strictEqual(m.idx, g.idx); assert.ok(g.idx !== 0); hits++; }
  }
  assert.ok(hits > 240 && hits < 360, 'hard hit rate ' + hits);
});

t('banter bag never repeats until exhausted', () => {
  const B = new E.Bag(['a', 'b', 'c', 'd']); const seen = new Set();
  for (let i = 0; i < 4; i++) seen.add(B.next()); assert.strictEqual(seen.size, 4);
  let prev = B.last; for (let i = 0; i < 40; i++) { const x = B.next(); assert.notStrictEqual(x, prev); prev = x; }
});

console.log(`\n${n} engine tests passed`);
