// node games/feud-and-delivery/tests/access.test.js
// Feud & Delivery shares the Congressional OB GYN lock: it loads ../congressional-obgyn/js/access.js and the same
// localStorage key, so the same PIN and the same CONG codes work in both. The real PIN is never written here:
// set COB_PIN to test it, otherwise a throwaway test PIN is swapped into an in-memory copy (see the office game's tests/testpin.js).
const fs = require('fs'), path = require('path');
const T = require('../../congressional-obgyn/tests/testpin.js');
const A = T.loadAccess();
const DIR = path.join(__dirname, '..');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8'), main = fs.readFileSync(path.join(DIR, 'js/main.js'), 'utf8');
  ok(/<script src="\.\.\/congressional-obgyn\/js\/access\.js"><\/script>/.test(html), 'loads the office game\'s access module (one lock for both games)');
  ok(/'cob\.access'/.test(main), 'stores unlocks under the shared cob.access key');
  ok(!/PIN_HASH|PIN_SALT/.test(main + html), 'no PIN hash copied into this game');
  const today = A.nyDay();
  ok(await A.checkPin(T.PIN), 'instructor PIN accepted (' + (T.real ? 'real PIN from COB_PIN' : 'test PIN') + ')');
  ok(!(await A.checkPin('0000')) || T.PIN === '0000', 'wrong PIN rejected');
  const c = await A.makeCode(today);
  ok((await A.checkCode(c.code, today)).ok, 'code made by the office tool unlocks (' + c.code + ')');
  ok((await A.checkCode((await A.makeCode(today - 41)).code, today)).ok, '41-day-old code still valid');
  ok((await A.checkCode((await A.makeCode(today - 43)).code, today)).reason === 'expired', '43-day-old code expired');
  ok(!(await A.checkCode('CONG-2345-6789', today)).ok, 'made-up code rejected');
  // plain-text PIN scan of this game's folder (only meaningful with the real PIN in COB_PIN)
  const hits = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|html|css|md|json|txt|mjs)$/.test(f) && fs.readFileSync(p, 'utf8').includes(T.PIN)) hits.push(path.relative(DIR, p)); } })(DIR);
  if (T.real) ok(hits.length === 0, 'real PIN not written anywhere in games/feud-and-delivery ' + JSON.stringify(hits));
  else ok(true, 'PIN scan skipped (set COB_PIN to scan for the real PIN)');
  console.log(fail ? fail + ' FAILED' : 'ALL ACCESS TESTS PASSED'); process.exit(fail ? 1 : 0);
})();
