// node games/dr-behrams-office/tests/answer-length.test.js
// Guards against the "longest answer is right" cue in every multiple-choice question of the cabinet
// (Clinic Day bank, SUTURE SELF! step/complication quizzes and the breech mini-quiz). Run `node tests/mcq.js -v`
// to see the current numbers and the questions where the correct option is the longest.
// Ties for longest/shortest are shared fractionally, so "chance" is the mean of 1/(number of options).
const fs = require('fs'), path = require('path');
const { load, stats, words } = require('./mcq.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const all = load();
const pct = x => x.toFixed(1) + '%';
ok(all.filter(q => q.game === 'clinic').length >= 250, 'loaded the Clinic Day bank (' + all.filter(q => q.game === 'clinic').length + ' questions)');
ok(all.filter(q => q.game === 'surgery').length >= 30, 'loaded the SUTURE SELF! quizzes (' + all.filter(q => q.game === 'surgery').length + ')');
ok(all.filter(q => q.id.startsWith('mini/breech/')).length === 3, 'loaded the breech mini-quiz');
ok(all.every(q => q.opts.length >= 4 && q.opts.every(o => typeof o === 'string' && o.trim())), 'every question has 4+ non-empty options');
ok(all.every(q => new Set(q.opts.map(o => o.trim().toLowerCase())).size === q.opts.length), 'no duplicate options');

for (const g of ['clinic', 'surgery']) {
  const s = stats(all.filter(q => q.game === g)), ch = s.chancePct;
  console.log('-- ' + g + ': n=' + s.n + ', chance ' + pct(ch));
  ok(s.longestPct <= ch + 3, g + ': correct is the longest (words) in ' + pct(s.longestPct) + ' (max chance+3 = ' + pct(ch + 3) + ')');
  ok(s.strictLongestPct <= ch, g + ': correct is strictly longest in ' + pct(s.strictLongestPct) + ' (max ' + pct(ch) + ')');
  ok(Math.abs(s.shortestPct - ch) <= 10, g + ': correct is the shortest in ' + pct(s.shortestPct) + ' (chance ±10)');
  ok(Math.abs(s.longestPct - s.shortestPct) <= 15, g + ': longest vs shortest shares within 15 points');
  ok(s.meanRatio >= 0.9 && s.meanRatio <= 1.1, g + ': mean correct/avg-distractor word ratio ' + s.meanRatio.toFixed(2) + ' (0.9–1.1)');
  ok(s.over30.length === 0, g + ': no correct answer over 130% of its longest distractor ' + JSON.stringify(s.over30));
  ok(s.charLongestPct <= ch + 5, g + ': correct is the longest (characters) in ' + pct(s.charLongestPct) + ' (max chance+5)');
  ok(s.charRatio >= 0.9 && s.charRatio <= 1.15, g + ': mean correct/avg-distractor character ratio ' + s.charRatio.toFixed(2) + ' (0.9–1.15)');
  ok(s.aota.length === 0, g + ': no "all/none/both of the above" options ' + JSON.stringify(s.aota));
  ok(s.absDistractorPct - s.absCorrectPct <= 5, g + ': absolute words (always/never/only/all/must...) not concentrated in distractors (' + pct(s.absCorrectPct) + ' vs ' + pct(s.absDistractorPct) + ')');
  ok(s.hedgeCorrectPct - s.hedgeDistractorPct <= 5, g + ': hedges (usually/may/likely...) not concentrated on correct answers (' + pct(s.hedgeCorrectPct) + ' vs ' + pct(s.hedgeDistractorPct) + ')');
}
// No over-explained correct answers: a hard cap on length.
const longC = all.filter(q => words(q.opts[0]) > 14);
ok(longC.length === 0, 'no correct answer over 14 words ' + JSON.stringify(longC.map(q => q.id)));

// Answer positions: Clinic Day shuffles at runtime (core.js buildQuestions); check the spread is uniform.
global.window = undefined; const C = require('../office/js/core.js');
const r = C.rng(12345), pos = [0, 0, 0, 0, 0]; let tot = 0;
const w1 = { COB_BANK: [] }; w1.window = w1;
new Function('window', 'COB_BANK', fs.readFileSync(path.join(__dirname, '..', 'office', 'js', 'bank.js'), 'utf8'))(w1, w1.COB_BANK);
for (let rep = 0; rep < 40; rep++) for (const t of w1.COB_BANK) for (const c of t.cases)
  C.buildQuestions(c, r).forEach(q => { if (q.opts.length !== 5) return; pos[q.opts.findIndex(o => o.correct)]++; tot++; });
ok(pos.every(p => Math.abs(p / tot - 0.2) < 0.02), 'Clinic Day: correct position uniform over 5 slots ' + JSON.stringify(pos.map(p => (100 * p / tot).toFixed(1))));
const cq = C.buildQuestions(w1.COB_BANK[0].cases[0], C.rng(7))[0];
ok(cq.answerText === w1.COB_BANK[0].cases[0].q[0][2][0] && cq.opts.filter(o => o.correct).length === 1, 'Clinic Day: exactly one correct option, answer text kept');
// SUTURE SELF! shuffles inside G.quiz (main.js); the breech mini-quiz goes through G.quiz too.
const main = fs.readFileSync(path.join(__dirname, '..', 'surgery', 'js', 'main.js'), 'utf8');
ok(/G\.quiz = function[\s\S]{0,200}right: i === 0[\s\S]{0,40}opts = shuffle\(opts\)/.test(main), 'SUTURE SELF!: G.quiz shuffles options');
ok(/g\.quiz\(\{[^}]*opts: \[s\.a\]\.concat\(s\.w\)/.test(fs.readFileSync(path.join(__dirname, '..', 'surgery', 'js', 'mini.js'), 'utf8')), 'breech mini-quiz goes through G.quiz');

console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
