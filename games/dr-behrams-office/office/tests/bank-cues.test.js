// Bank lint: the right answer must not be given away by length, and explanations must not repeat themselves. node games/dr-behrams-office/office/tests/bank-cues.test.js
const fs = require('fs'), path = require('path');
global.window = global; global.COB_BANK = []; require(path.join(__dirname, '..', 'js', 'bank.js'));
let n = 0, longest = 0, fail = 0; const bad = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
// bank source lists the correct option first (it is shuffled at play time)
for (const t of COB_BANK) for (const c of t.cases) for (const q of c.q) { const o = q[2], L = o.map(s => s.length), d = Math.max(...L.slice(1)); n++;
  if (L[0] >= d) longest++; if (L[0] > 2.5 * d) bad.push(t.id + ': ' + o[0].slice(0, 50)); }
ok(n > 100, n + ' questions scanned');
ok(bad.length === 0, 'no correct answer over 2.5x the longest distractor ' + JSON.stringify(bad.slice(0, 5)));
ok(longest / n < 0.75, 'correct option longest in ' + (100 * longest / n).toFixed(1) + '% (cap 75%)');
// explanations must not end by restating themselves (2026-11-03: 8 'why' texts ended with a sentence that repeated an earlier
// one, one of them with a different, less accurate wording). Flag a last sentence whose content words are >= 60% already
// used earlier in the same explanation. KEEP = deliberate take-home lines that apply the rule to this patient.
const KEEP = [/^Locate the placenta BEFORE/, /^Her normal pubic hair points/];
const words = x => x.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
const rep = [];
for (const t of COB_BANK) for (const c of t.cases) for (const q of c.q) { const ss = q[3].split(/(?<=[.!?])\s+/); if (ss.length < 2) continue;
  const last = ss[ss.length - 1], L = new Set(words(last)), prev = new Set(words(ss.slice(0, -1).join(' ')));
  if (L.size >= 3 && [...L].filter(w => prev.has(w)).length / L.size >= 0.6 && !KEEP.some(k => k.test(last))) rep.push(t.id + ': ' + last.slice(0, 60)); }
ok(rep.length === 0, 'no explanation ends by restating itself ' + JSON.stringify(rep.slice(0, 5)));
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
