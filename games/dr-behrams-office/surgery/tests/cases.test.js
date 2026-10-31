// Content lint for SUTURE SELF!: node games/dr-behrams-office/surgery/tests/cases.test.js
// Every case has a pre-op, every step has a kind the game can run, a teaching note and a pearl, every Mayo-stand
// tool exists, every complication can actually fire (its 'at' step is in the case) and has a right answer.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..');
let fail = 0, n = 0; const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL ' + m); } };
global.window = {};
new Function(fs.readFileSync(path.join(D, 'js', 'cases.js'), 'utf8'))();
const S = window.SS, mini = fs.readFileSync(path.join(D, 'js', 'mini.js'), 'utf8');
const KINDS = new Set(['quiz', 'timeout']); for (const m of mini.matchAll(/SM\.([a-zA-Z]+) = function/g)) KINDS.add(m[1]);
ok(S.CASES.length === 7, '7 cases');
const ids = new Set();
for (const c of S.CASES) {
  ok(!ids.has(c.id), 'unique id ' + c.id); ids.add(c.id);
  for (const f of ['title', 'proc', 'short', 'type', 'anes', 'hp', 'ind', 'consent', 'pre', 'post']) ok(c[f], c.id + ' has ' + f);
  ok(S.CHAPTERS[c.ch], c.id + ' chapter');
  const steps = c.steps(); ok(steps.length >= 8, c.id + ' has ' + steps.length + ' steps');
  const sids = new Set(steps.map(s => s.id));
  ok(steps[0].k === 'timeout', c.id + ' starts with the time-out'); ok(steps[steps.length - 1].k === 'count', c.id + ' ends with the count');
  for (const st of steps) {
    ok(KINDS.has(st.k), c.id + '/' + st.id + ' kind ' + st.k + ' is implemented');
    ok(st.name && st.note && st.note.length > 20, c.id + '/' + st.id + ' has a name and an op-note sentence');
    ok(st.k === 'timeout' || (st.pearl && st.pearl.length > 20), c.id + '/' + st.id + ' has a teaching pearl');
    if (st.tool) ok(S.TOOLS[st.tool], c.id + '/' + st.id + ' tool ' + st.tool + ' exists');
    for (const q of [st.quiz].concat(st.quizzes || []).filter(Boolean)) ok(q.q && q.opts && q.opts.length >= 3 && q.opts.every(Boolean), c.id + '/' + st.id + ' quiz well formed');
  }
  for (const x of c.surprises) {
    const X = S.SURPRISES[x]; ok(X, c.id + ' surprise ' + x + ' exists'); if (!X) continue;
    ok(sids.has(X.at), c.id + ' surprise ' + x + " fires at step '" + X.at + "' which is in the case");
    ok(X.title && X.finding && (X.quiz || X.q), c.id + ' surprise ' + x + ' has a title, finding and a question');
  }
}
const all = ['index.html', 'js/cases.js', 'js/main.js', 'js/mini.js', 'js/render.js'].map(f => fs.readFileSync(path.join(D, f), 'utf8')).join('\n');
ok(!/family feud|\boperation\b(?!s)/i.test(all.replace(/operative|operating/gi, '')), "no 'Family Feud' / 'Operation' trademark text");
console.log(fail ? fail + ' of ' + n + ' FAILED' : 'ALL ' + n + ' PASSED'); process.exit(fail ? 1 : 0);
