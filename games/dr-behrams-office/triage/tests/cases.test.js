// Content lint for OB TRIAGE cases (js/cases.js): node games/dr-behrams-office/triage/tests/cases.test.js
// Every case is well formed with one management question (4–6 options, exactly one best, never the longest), and the strip each case actually generates (over 8 seeds)
// matches its intended teaching pattern (C.EXPECT), both by ground truth and by the independent sample-only analyzer.
const fs = require('fs'), path = require('path');
const CTG = require('../js/ctg.js'), C = require('../js/cases.js');
const TP = require('../../office/tests/testpin.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const GR = ['best', 'ok', 'meh', 'wrong', 'harm'];
ok(C.CASES.length >= 14, C.CASES.length + ' cases (≥ 14)');
ok(new Set(C.CASES.map(c => c.id)).size === C.CASES.length, 'case ids are unique');
ok(!C.ACTIONS && !C.GROUPS, 'no action menu: one management choice per patient');
ok(['nurse', 'gas', 'peds'].every(k => C.TEAM[k] && C.TEAM[k].name && C.TEAM[k].initials), 'fictional team defined (nurse, anesthesia, peds)');
for (const c of C.CASES) {
  const P = c.pt || {}, bad = [], ch = c.choice || {}, O = ch.opts || [];
  ['name', 'age', 'gp', 'ga', 'cc', 'hx', 'vitals', 'exam', 'meds'].forEach(k => { if (P[k] == null) bad.push('pt.' + k); });
  ['title', 'tag', 'bed', 'present', 'nurse', 'choice', 'debrief'].forEach(k => { if (c[k] == null) bad.push(k); });
  if (!C.CHAPTERS[c.ch]) bad.push('chapter');
  if (!(ch.q && ch.q.length > 8)) bad.push('choice.q');
  if (!(ch.hint && ch.hint.length > 15)) bad.push('choice.hint');
  if (!(O.length >= 4 && O.length <= 6)) bad.push(O.length + ' options (want 4–6)');
  if (O.filter(o => o.g === 'best').length !== 1) bad.push('exactly one best option');
  if (O[0] && O[0].g !== 'best') bad.push('best option authored first');
  O.forEach((o, i) => { if (!GR.includes(o.g)) bad.push('bad grade ' + i); if (!(o.t && o.t.length >= 8)) bad.push('short option ' + i); if (!(o.why && o.why.length > 15)) bad.push('no why for ' + i); });
  if (new Set(O.map(o => o.t)).size !== O.length) bad.push('duplicate option text');
  if (O[0] && O.every(o => o === O[0] || o.t.length < O[0].t.length)) bad.push('best option is the longest');
  if (!(c.debrief && c.debrief.summary && c.debrief.pearls && c.debrief.pearls.length >= 3)) bad.push('debrief ≥3 pearls');
  for (const k in (c.p || {})) if (!(k in CTG.DEF) && !['rMin', 'rMax'].includes(k)) bad.push('unknown param ' + k);
  (c.hist || []).forEach((h, i) => { if (!(h.t >= 0 && h.t <= C.HIST)) bad.push('hist ' + i + ' t'); if (h.set) for (const k in h.set) if (!(k in CTG.DEF) && !['rMin', 'rMax'].includes(k)) bad.push('hist ' + i + ' unknown param ' + k); });
  if (!C.EXPECT[c.id]) bad.push('no EXPECT');
  if (!(C.SEV[c.id] >= 0)) bad.push('no severity');
  ok(!bad.length, c.id + ': well formed, one best of ' + O.length + ' options ' + bad.join(', '));
}
// the generated strip teaches what the case says (truth: every seed; analyzer: ≥ 7/8 seeds, 'indeterminate' accepted where decels leave no clean minute)
for (const c of C.CASES) {
  const E = C.EXPECT[c.id]; let tBad = [], aBad = 0, aNote = [];
  for (let seed = 1; seed <= 8; seed++) {
    const s = C.start(c, seed, CTG), T = s.truth(C.HIST), A = CTG.analyze(s.fhr, s.uc, C.HIST);
    for (const k in E) { const v = k === 'accels' ? T.accels > 0 : T[k]; if (k === 'baseline' ? Math.abs(v - E[k]) > 5 : v !== E[k]) tBad.push(seed + ':' + k + '=' + v); }
    const m = ['predominant', 'category', 'tachysystole'].filter(k => A[k] !== T[k]);
    if (A.variability !== T.variability && A.variability !== 'indeterminate') m.push('variability');
    if (Math.abs(A.baseline - T.baseline) > 5) m.push('baseline');
    if (m.length) { aBad++; aNote.push(seed + ':' + m.join('/')); }
  }
  ok(tBad.length <= 1, c.id + ': ground truth matches the teaching pattern on ≥ 7/8 seeds ' + tBad.join(' '));
  ok(aBad <= 1, c.id + ': independent analyzer agrees with the answer key on ≥ 7/8 seeds ' + aNote.join(' '));
}
// pattern coverage the owner asked for
const pats = new Set(Object.values(C.EXPECT).map(e => e.predominant));
ok(['early', 'late-rec', 'var-rec', 'prolonged', 'none'].every(p => pats.has(p)), 'covers early, late, variable, prolonged and none');
ok(Object.values(C.EXPECT).some(e => e.tachysystole) && Object.values(C.EXPECT).some(e => e.variability === 'sinusoidal') && Object.values(C.EXPECT).some(e => e.category === 3), 'covers tachysystole, sinusoidal and Category III');
const bests = C.CASES.map(c => c.choice.opts[0].t.toLowerCase());
ok(['discharge', 'admit', 'cesarean', 'vacuum', 'oxytocin', 'amnioinfusion'].every(w => bests.some(b => b.includes(w))), 'best calls span discharge, admit, cesarean, operative vaginal birth, stop oxytocin and amnioinfusion');
// no trademarks, no real student names; the instructor PIN never appears
const D = path.join(__dirname, '..'), src = ['index.html', 'js/main.js', 'js/cases.js', 'js/ctg.js', 'js/audio.js', 'css/style.css'].map(f => fs.readFileSync(path.join(D, f), 'utf8')).join('\n');
ok(!/pitocin|cytotec|tylenol|brethine|cervidil|family feud|\bepic\b/i.test(src), 'no brand/trademark names (generic drug names only)');
ok(!/behram\.(jpg|png)|students?\/|faces?\//i.test(src) && /behram\.webp/.test(src), 'only the Dr. Behram portrait is used (no student photos)');
ok(TP.real ? !TP.scanFor(TP.PIN, D).length : true, 'real PIN not present in triage/ (checked when COB_PIN is set)');
ok(!/COB_PIN|PIN_HASH/.test(src), 'triage code never touches the PIN');
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
