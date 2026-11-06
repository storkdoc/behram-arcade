/* NAME THAT GROOVE logic tests (pure Node, deterministic, no browser, no network).
   Covers the real-song catalog, decade modes, question generation, answer-position / length balance,
   swapping out an unplayable video, scoring and high scores.
   Run from the repo root:  node games/name-that-groove/tests/logic.test.js */
const path = require('path'), fs = require('fs');
const C = require(path.join(__dirname, '..', 'js', 'catalog.js'));
const Q = require(path.join(__dirname, '..', 'js', 'quiz.js'));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };

console.log('== catalog (real songs on YouTube)');
const N = C.SONGS.length;
check(N >= 60, 'at least 60 real songs', N);
for (const d of C.DECADES) { const s = C.songsFor(d); const lo = +('19' + d.slice(0, 2)); check(s.length >= 20 && s.every(x => x.year >= lo && x.year <= lo + 9), `${d}: ${s.length} songs, all released ${lo}-${lo + 9}`); }
check(new Set(C.SONGS.map(s => s.id)).size === N && new Set(C.SONGS.map(s => s.yt)).size === N, 'ids and YouTube video ids are unique');
check(C.SONGS.every(s => /^[A-Za-z0-9_-]{11}$/.test(s.yt)), 'every entry has an 11-character YouTube video id');
check(C.SONGS.every(s => s.title && s.artist && s.genre && Number.isInteger(s.start) && s.start >= 0 && s.start < 400), 'every entry has title, artist, genre and a clip start second');
check(new Set(C.SONGS.map(s => (s.title + '|' + s.artist).toLowerCase())).size === N, 'no song listed twice');
check(/YouTube/.test(C.SOURCE_NOTE) && /ads/.test(C.SOURCE_NOTE), 'honest note: YouTube controls availability and any ads');
check(C.watchUrl(C.SONGS[0]).startsWith('https://www.youtube.com/watch?v=' + C.SONGS[0].yt), 'watch-on-YouTube links');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'catalog.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
check(!/arrange|playArrangement|NTG_Arrange/.test(src) && !fs.existsSync(path.join(__dirname, '..', 'js', 'arrange.js')), 'no synthesized song clips are left in the game');
const audioSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');
check(!/playArrangement/.test(audioSrc), 'audio.js only does UI sound effects');
const ytSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'yt.js'), 'utf8');
check(/https:\/\/www\.youtube\.com\/iframe_api/.test(ytSrc) && !/googlevideo|\.mp3|\.m4a|adblock|skipAd|cancelAd/i.test(ytSrc), 'music only through the official IFrame API; no media URLs and no ad tampering');

console.log('== decade modes + question generation');
const MODES = ['70s', '80s', '90s', 'all'], DIFFS = ['easy', 'normal', 'hard'];
let ok = true, dupe = false, okDec = true, okArtist = true, okHard = true, okAll = true, okLen = true, nq = 0, tight = 0;
for (const m of MODES) for (const d of DIFFS) for (let seed = 0; seed < 200; seed++) {
  const r = Q.makeRound({ mode: m, diff: d, seed });
  if (r.questions.length !== 10) ok = false;
  const ans = r.questions.map(q => q.answer); if (new Set(ans).size !== 10) dupe = true;
  if (r.spares.some(id => ans.includes(id))) dupe = true;
  if (m === 'all') { const decs = r.questions.map(q => q.decade); const cnt = C.DECADES.map(x => decs.filter(y => y === x).length).sort(); if (cnt.join() !== '3,3,4') okAll = false; }
  for (const q of r.questions) {
    const songs = q.choices.map(C.byId);
    if (q.choices.length !== 4 || new Set(q.choices).size !== 4 || q.choices[q.correct] !== q.answer) ok = false;
    if (!songs.every(s => s.decade === q.decade) || (m !== 'all' && q.decade !== m)) okDec = false;
    if (new Set(songs.map(s => s.artist)).size !== 4) okArtist = false;
    if (d === 'hard' && C.songsFor(q.decade).some(s => s.genre === q.genre && s.artist !== C.byId(q.answer).artist && s.id !== q.answer) && !songs.some((s, i) => i !== q.correct && s.genre === q.genre)) okHard = false;
    const L = songs.map(s => s.title.length), spread = Math.max(...L) - Math.min(...L); nq++; if (spread <= 12) tight++; if (spread > 28) okLen = false;
  }
}
check(ok, 'every round has 10 questions with 4 distinct choices, answer in the right slot');
check(!dupe, 'no song repeats within a round, and spares are separate');
check(okDec, 'all four choices come from the same decade (decade modes use only that decade)');
check(okArtist, 'four different artists in every question');
check(okAll, 'ALL mode splits a round 4/3/3 across the three decades');
check(okHard, 'Crate Digger: a decoy shares the answer\'s genre whenever the crate has one');
check(okLen && tight / nq > 0.97, 'choice titles have comparable lengths (97%+ within 12 characters, never more than 28 apart)', (tight / nq).toFixed(3));
const r1 = Q.makeRound({ mode: '80s', diff: 'normal', seed: 42 }), r2 = Q.makeRound({ mode: '80s', diff: 'normal', seed: 42 }), r3 = Q.makeRound({ mode: '80s', diff: 'normal', seed: 43 });
check(JSON.stringify(r1) === JSON.stringify(r2), 'same seed => same round (deterministic)');
check(JSON.stringify(r1.questions) !== JSON.stringify(r3.questions), 'different seed => different round');
check(C.SONGS.every(s => Number.isInteger(s.end) && s.end - s.start === C.clipLen(s) && C.clipLen(s) >= 10 && C.clipLen(s) <= 20), 'every song has one fixed excerpt window [start, end] of 10-20 s');
check(Object.values(Q.DIFFS).every(d => d.clip === undefined), 'difficulty never changes the excerpt (same window on every level)');

console.log('== answer-position and length balance');
let T = 0, pos = [0, 0, 0, 0], longest = 0, shortest = 0, worstRound = 0;
for (const m of MODES) for (const d of DIFFS) for (let seed = 0; seed < 300; seed++) {
  const r = Q.makeRound({ mode: m, diff: d, seed }); const rp = [0, 0, 0, 0];
  for (const q of r.questions) {
    T++; pos[q.correct]++; rp[q.correct]++;
    const L = q.choices.map(id => C.byId(id).title.length), c = L[q.correct];
    if (L.every((l, i) => i === q.correct || l < c)) longest++;
    if (L.every((l, i) => i === q.correct || l > c)) shortest++;
  }
  worstRound = Math.max(worstRound, ...rp);
}
const share = pos.map(p => p / T);
check(share.every(s => s > 0.235 && s < 0.265), 'correct answer lands in each slot ~25% of the time', share.map(s => s.toFixed(3)));
check(worstRound <= 3, 'within a round no slot holds the answer more than 3 times', worstRound);
check(longest / T < 0.12, 'correct answer is the strictly longest title rarely (chance would be 25%)', (longest / T).toFixed(3));
check(shortest / T < 0.35, 'correct answer is not predictably the shortest either', (shortest / T).toFixed(3));
const q0 = Q.makeRound({ mode: 'all', diff: 'normal', seed: 1 }).questions[0];
const ff = Q.fiftyFifty(q0, 1);
check(ff.length === 2 && !ff.includes(q0.correct) && JSON.stringify(ff) === JSON.stringify(Q.fiftyFifty(q0, 1)), '50:50 removes two wrong answers, repeatably');

console.log('== unplayable videos');
const rs = Q.makeRound({ mode: '90s', diff: 'hard', seed: 5 }); const before = rs.questions[3];
check(Q.swapQuestion(rs, 3, new Set()), 'a broken video is swapped for a spare');
const after = rs.questions[3];
check(after.answer !== before.answer && after.correct === before.correct && after.decade === before.decade && after.choices[after.correct] === after.answer && after.swapped === 1, 'swap keeps the slot and decade, new answer', { before: before.answer, after: after.answer });
check(new Set(rs.questions.map(q => q.answer)).size === 10, 'still no repeats after a swap');
const excl = new Set(C.songsFor('70s').slice(0, 10).map(s => s.id));
check(Q.makeRound({ mode: '70s', diff: 'normal', seed: 9, exclude: excl }).questions.every(q => !excl.has(q.answer)), 'songs that failed on this device are left out of new rounds');
const rx = Q.makeRound({ mode: '80s', diff: 'easy', seed: 2 }); let n = 0; while (Q.swapQuestion(rx, 0, new Set())) n++;
check(n === C.songsFor('80s').length - 10 && !Q.swapQuestion(rx, 0, new Set()), 'swapping stops cleanly when the spares run out (no endless loop)', n);

console.log('== scoring');
const s0 = Q.scoreAnswer({ correct: true, elapsed: 0, clipLen: 15, streak: 0 });
check(s0.total === 250 && s0.speed === 150 && s0.streak === 1, 'instant answer = 100 + 150 speed', s0);
const sHalf = Q.scoreAnswer({ correct: true, elapsed: 7.5, clipLen: 15, streak: 0 });
check(sHalf.speed === 75 && sHalf.total === 175, 'halfway through the clip = +75 speed', sHalf);
check(Q.scoreAnswer({ correct: true, elapsed: 20, clipLen: 15, streak: 0 }).total === 100, 'after the clip ends = base 100 only');
check(Q.scoreAnswer({ correct: true, elapsed: 0, clipLen: 15, streak: 2 }).total === 375, 'third in a row = x1.5');
check(Q.scoreAnswer({ correct: true, elapsed: 0, clipLen: 15, streak: 9 }).mult === 2, 'streak multiplier caps at x2');
check(Q.scoreAnswer({ correct: true, elapsed: 0, clipLen: 15, streak: 0, hinted: true }).total === 125, '50:50 halves the points');
const w = Q.scoreAnswer({ correct: false, elapsed: 1, clipLen: 15, streak: 6 });
check(w.total === 0 && w.streak === 0, 'wrong answer = 0 and resets the streak');
check(Q.rankFor(Q.MAX_ROUND, 1) === 'PLATINUM EARS' && Q.rankFor(0, 0) === 'NEEDS MORE SPINS', 'ranks');
const mem = {}; const store = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
[500, 900, 100, 1200, 700, 300, 1000].forEach((s, i) => Q.saveBest(store, '90s', 'hard', { score: s, right: 5, date: '2026-11-0' + i }));
const best = Q.loadBest(store, '90s', 'hard');
check(best.length === 5 && best[0].score === 1200 && best[4].score === 500, 'high scores keep the top 5, best first', best.map(b => b.score));
check(Q.loadBest(store, '70s', 'hard').length === 0, 'high scores are kept per mode and difficulty');
mem[Q.bestKey('80s', 'easy')] = '{oops'; check(Q.loadBest(store, '80s', 'easy').length === 0, 'corrupt saved scores are ignored');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
