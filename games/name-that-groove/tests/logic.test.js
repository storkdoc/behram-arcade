/* NAME THAT GROOVE logic tests (pure Node, deterministic, no browser).
   Covers the song catalog, decade modes, question generation, answer-position / length balance,
   scoring, high scores and the composer.   Run from the repo root:  node games/name-that-groove/tests/logic.test.js */
const path = require('path');
const C = require(path.join(__dirname, '..', 'js', 'catalog.js'));
const Q = require(path.join(__dirname, '..', 'js', 'quiz.js'));
const A = require(path.join(__dirname, '..', 'js', 'arrange.js'));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };

console.log('== catalog');
check(C.SONGS.length === 72, '72 tracks', C.SONGS.length);
for (const d of C.DECADES) { const s = C.songsFor(d); check(s.length === 24 && new Set(s.map(x => x.style)).size === 6, `${d}: 24 tracks across 6 styles`); }
check(C.songsFor('all').length === 72, 'ALL mode uses the whole crate');
check(new Set(C.SONGS.map(s => s.title.toLowerCase())).size === 72, 'titles are unique');
check(new Set(C.SONGS.map(s => s.id)).size === 72 && new Set(C.SONGS.map(s => s.seed)).size === 72, 'ids and seeds are unique');
check(C.SONGS.every(s => s.original === true && s.artist && s.tag), 'every track is flagged as an original, with a fictional artist and a style tag');
check(/original/i.test(C.ORIGINAL_NOTE) && /not a real/i.test(C.ORIGINAL_NOTE), 'honest "original, not a real hit" note');
const lens = C.SONGS.map(s => s.title.length);
check(Math.min(...lens) >= 10 && Math.max(...lens) <= 22, 'titles have comparable lengths (10-22 chars)', [Math.min(...lens), Math.max(...lens)]);
check(Object.values(C.STYLES).every(st => st.drums.k.length === 16 && Object.values(st.drums).every(p => p.length === 16) && st.bass.every(b => b.length === 16) && st.compRhythm.every(r => r.length === 16)), 'every style pattern is 16 steps');

console.log('== decade modes + question generation');
const MODES = ['70s', '80s', '90s', 'all'], DIFFS = ['easy', 'normal', 'hard'];
let ok = true, dupe = false, okDec = true, okEasy = true, okHard = true, okAll = true, okLen = true;
for (const m of MODES) for (const d of DIFFS) for (let seed = 0; seed < 200; seed++) {
  const r = Q.makeRound({ mode: m, diff: d, seed });
  if (r.questions.length !== 10) ok = false;
  const ans = r.questions.map(q => q.answer); if (new Set(ans).size !== 10) dupe = true;
  if (m === 'all') { const decs = r.questions.map(q => q.decade); const cnt = C.DECADES.map(x => decs.filter(y => y === x).length).sort(); if (cnt.join() !== '3,3,4') okAll = false; }
  for (const q of r.questions) {
    const songs = q.choices.map(C.byId);
    if (q.choices.length !== 4 || new Set(q.choices).size !== 4 || q.choices[q.correct] !== q.answer) ok = false;
    if (m !== 'all' && !songs.every(s => s.decade === m)) okDec = false;
    const sameStyle = songs.filter((s, i) => i !== q.correct && s.style === q.style).length;
    if (d !== 'hard' && new Set(songs.map(s => s.style)).size !== 4) okEasy = false;
    if (d === 'hard' && sameStyle !== 1) okHard = false;
    const L = songs.map(s => s.title.length); if (Math.max(...L) - Math.min(...L) > 12) okLen = false;
  }
}
check(ok, 'every round has 10 questions with 4 distinct choices, answer in the right slot');
check(!dupe, 'no track repeats within a round');
check(okDec, 'decade modes only use that decade');
check(okAll, 'ALL mode splits a round 4/3/3 across the three decades');
check(okEasy, 'Easy / Normal: four different styles per question');
check(okHard, 'Crate Digger: exactly one decoy shares the answer\'s style');
check(okLen, 'choices in a question are within 12 characters of each other');
const r1 = Q.makeRound({ mode: '80s', diff: 'normal', seed: 42 }), r2 = Q.makeRound({ mode: '80s', diff: 'normal', seed: 42 }), r3 = Q.makeRound({ mode: '80s', diff: 'normal', seed: 43 });
check(JSON.stringify(r1) === JSON.stringify(r2), 'same seed => same round (deterministic)');
check(JSON.stringify(r1.questions) !== JSON.stringify(r3.questions), 'different seed => different round');

console.log('== answer-position and length balance');
let N = 0, pos = [0, 0, 0, 0], longest = 0, shortest = 0, worstRound = 0;
for (const m of MODES) for (const d of DIFFS) for (let seed = 0; seed < 300; seed++) {
  const r = Q.makeRound({ mode: m, diff: d, seed }); const rp = [0, 0, 0, 0];
  for (const q of r.questions) {
    N++; pos[q.correct]++; rp[q.correct]++;
    const L = q.choices.map(id => C.byId(id).title.length), c = L[q.correct];
    if (L.every((l, i) => i === q.correct || l < c)) longest++;
    if (L.every((l, i) => i === q.correct || l > c)) shortest++;
  }
  worstRound = Math.max(worstRound, ...rp);
}
const share = pos.map(p => p / N);
check(share.every(s => s > 0.235 && s < 0.265), 'correct answer lands in each slot ~25% of the time', share.map(s => s.toFixed(3)));
check(worstRound <= 3, 'within a round no slot holds the answer more than 3 times', worstRound);
check(longest / N < 0.08, 'correct answer is the strictly longest title < 8% of the time (chance would be 25%)', (longest / N).toFixed(3));
check(shortest / N < 0.3, 'correct answer is not predictably the shortest either', (shortest / N).toFixed(3));
const q0 = Q.makeRound({ mode: 'all', diff: 'normal', seed: 1 }).questions[0];
const ff = Q.fiftyFifty(q0, 1);
check(ff.length === 2 && !ff.includes(q0.correct) && JSON.stringify(ff) === JSON.stringify(Q.fiftyFifty(q0, 1)), '50:50 removes two wrong answers, repeatably');

console.log('== scoring');
const s0 = Q.scoreAnswer({ correct: true, elapsed: 0, clipLen: 14, streak: 0 });
check(s0.total === 250 && s0.speed === 150 && s0.streak === 1, 'instant answer = 100 + 150 speed', s0);
const sHalf = Q.scoreAnswer({ correct: true, elapsed: 7, clipLen: 14, streak: 0 });
check(sHalf.speed === 75 && sHalf.total === 175, 'halfway through the clip = +75 speed', sHalf);
const sLate = Q.scoreAnswer({ correct: true, elapsed: 20, clipLen: 14, streak: 0 });
check(sLate.speed === 0 && sLate.total === 100, 'after the clip ends = base 100 only', sLate);
check(Q.scoreAnswer({ correct: true, elapsed: 0, clipLen: 14, streak: 2 }).total === 375, 'third in a row = x1.5');
check(Q.scoreAnswer({ correct: true, elapsed: 0, clipLen: 14, streak: 9 }).mult === 2, 'streak multiplier caps at x2');
check(Q.scoreAnswer({ correct: true, elapsed: 0, clipLen: 14, streak: 0, hinted: true }).total === 125, '50:50 halves the points');
const w = Q.scoreAnswer({ correct: false, elapsed: 1, clipLen: 14, streak: 6 });
check(w.total === 0 && w.streak === 0, 'wrong answer = 0 and resets the streak');
check(Q.MAX_ROUND === 250 + 313 + 375 + 438 + 500 * 6, 'max round score (10 instant answers)', Q.MAX_ROUND);
check(Q.rankFor(Q.MAX_ROUND, 1) === 'PLATINUM EARS' && Q.rankFor(0, 0) === 'NEEDS MORE SPINS', 'ranks');
const mem = {}; const store = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
[500, 900, 100, 1200, 700, 300, 1000].forEach((s, i) => Q.saveBest(store, '90s', 'hard', { score: s, right: 5, date: '2026-11-0' + i }));
const best = Q.loadBest(store, '90s', 'hard');
check(best.length === 5 && best[0].score === 1200 && best[4].score === 500, 'high scores keep the top 5, best first', best.map(b => b.score));
check(Q.loadBest(store, '70s', 'hard').length === 0, 'high scores are kept per mode and difficulty');
mem['ntg.best.80s.easy'] = '{oops'; check(Q.loadBest(store, '80s', 'easy').length === 0, 'corrupt saved scores are ignored');

console.log('== composer');
let okArr = true, okStage = true, okLayer = true; const hooks = new Set(), sig = new Set();
for (const s of C.SONGS) {
  const a = A.arrange(s), b = A.arrange(s);
  if (JSON.stringify(a.events) !== JSON.stringify(b.events)) okArr = false;
  if (!(a.length > 9 && a.length < 22) || a.events.some(e => !(e.t >= 0 && e.t < a.length) || (e.midi !== undefined && !(e.midi >= 24 && e.midi <= 108)) || (e.dur !== undefined && !(e.dur > 0)))) okArr = false;
  const st = a.stages.map(x => x.t); if (!(st[0] === 0 && st[1] < st[2] && st[2] < st[3])) okStage = false;
  const first = k => Math.min(...a.events.filter(e => e.layer === k).map(e => e.t));
  if (!(first('drums') < st[1] && first('bass') >= st[1] - 1e-9 && first('chords') >= st[2] - 1e-9 && first('hook') >= st[3] - 1e-9)) okLayer = false;
  hooks.add(JSON.stringify(a.events.filter(e => e.layer === 'hook').map(e => e.midi)));
  sig.add([a.bpm, a.params.root, a.params.mode, a.params.lead, a.params.comp].join());
}
check(okArr, 'every track arranges deterministically, 9-22 s long, sane pitches and times');
check(okStage, 'stages run drums -> bass -> chords -> hook');
check(okLayer, 'layers enter in order (nothing early)');
check(hooks.size === 72, 'all 72 hooks are different melodies', hooks.size);
check(sig.size >= 70, 'tempo/key/mode/instrument combos are (nearly) all distinct', sig.size);
const dec = d => C.songsFor(d).map(s => A.params(s));
const avgBpm = d => dec(d).reduce((t, p) => t + p.bpm, 0) / 24;
check(dec('90s').some(p => p.kit === '808' || p.kit === 'lofi') && dec('80s').some(p => p.kit === 'gated') && dec('70s').every(p => p.kit === 'acoustic' || p.kit === 'rock'), 'decade drum kits: 70s acoustic, 80s gated, 90s 808 / lo-fi / 909');
check(avgBpm('70s') > 95 && avgBpm('80s') > 95 && avgBpm('90s') > 95, 'tempos are in a danceable range', [avgBpm('70s'), avgBpm('80s'), avgBpm('90s')].map(Math.round));
const prev = A.arrange(C.SONGS[0], { fromBar: 3, bars: 2 });
check(prev.events.length > 0 && prev.events[0].t >= 0 && prev.length < A.arrange(C.SONGS[0]).length / 3 + 0.01 && prev.events.some(e => e.layer === 'hook'), 'hook preview (bars 4-5) for the reveal');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
