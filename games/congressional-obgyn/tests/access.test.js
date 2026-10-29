// node games/congressional-obgyn/tests/access.test.js
// The real instructor PIN is never written in this repo. Set COB_PIN to test it; otherwise the PIN check runs against
// a throwaway test PIN whose salted hash is swapped into an in-memory copy of access.js (see tests/testpin.js).
const T = require('./testpin.js');
const A = T.loadAccess();
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const today = A.nyDay();
  ok(await A.checkPin(T.PIN), 'instructor PIN accepted (' + (T.real ? 'real PIN from COB_PIN' : 'test PIN') + ')');
  const wrong = ['', '0000', '9999', T.PIN.slice(1) + T.PIN[0], String((+T.PIN + 1) % 10000).padStart(4, '0')].filter(w => w !== T.PIN);
  let wrongOk = 0; for (const w of wrong) if (await A.checkPin(w)) wrongOk++;
  ok(wrongOk === 0, 'wrong PINs rejected (' + wrong.length + ' tried)');
  const src = require('fs').readFileSync(__dirname + '/../js/access.js', 'utf8');
  ok(/PIN_SALT = '[0-9a-f]{16,}'/.test(src) && /PIN_HASH = '[0-9a-f]{64}'/.test(src), 'only a salted SHA-256 hash is stored');
  if (T.real) ok(T.scanFor(T.PIN).length === 0, 'real PIN not written in plain text anywhere in the game folder ' + JSON.stringify(T.scanFor(T.PIN)));
  const c0 = await A.makeCode(today);
  ok(/^CONG-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(c0.code), 'format ' + c0.code);
  const r0 = await A.checkCode(c0.code, today);
  ok(r0.ok && r0.issueDay === today && r0.expiresDay === today + 42, 'issued today valid, expires ' + A.fmtDay(r0.expiresDay));
  ok((await A.checkCode(c0.code.toLowerCase().replace(/-/g, ' '), today)).ok, 'lowercase / spaces accepted');
  const c41 = await A.makeCode(today - 41);
  ok((await A.checkCode(c41.code, today)).ok, 'issued 41 days ago valid (' + c41.code + ')');
  const c42 = await A.makeCode(today - 42);
  ok((await A.checkCode(c42.code, today)).reason === 'expired', 'issued 42 days ago expired');
  const c43 = await A.makeCode(today - 43);
  const r43 = await A.checkCode(c43.code, today);
  ok(!r43.ok && r43.reason === 'expired', 'issued 43 days ago expired (' + c43.code + ')');
  const cf = await A.makeCode(today + 10);
  ok(!(await A.checkCode(cf.code, today)).ok, 'future-dated code rejected');
  // tampering: change every single character position to every other symbol
  const AL = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; let accepted = 0, tried = 0;
  const raw = c0.code.replace(/^CONG-|-/g, '');
  for (let i = 0; i < 8; i++) for (const ch of AL) { if (ch === raw[i]) continue; const t = raw.slice(0, i) + ch + raw.slice(i + 1); tried++; if ((await A.checkCode(t, today)).ok) accepted++; }
  ok(accepted === 0, 'single-char tampered codes rejected (' + tried + ' tried, ' + accepted + ' accepted)');
  let rnd = 0; for (let i = 0; i < 3000; i++) { let s = ''; for (let j = 0; j < 8; j++) s += AL[Math.floor(Math.random() * 32)]; if ((await A.checkCode(s, today)).ok) rnd++; }
  ok(rnd <= 1, 'random codes rejected (' + rnd + '/3000 accepted)');
  ok(!(await A.checkCode('CONG-1234-ABCD', today)).ok && !(await A.checkCode('hello', today)).ok, 'garbage rejected');
  const many = new Set(); for (let i = 0; i < 20; i++) many.add((await A.makeCode(today)).code);
  ok(many.size >= 15, 'codes look random (' + many.size + ' distinct of 20)');
  ok(A.nyDay(new Date('2026-10-29T03:30:00Z')) === A.nyDay(new Date('2026-10-28T15:00:00Z')), 'NY date: 11:30 pm EDT still same day');
  console.log(fail ? fail + ' FAILED' : 'ALL ACCESS TESTS PASSED'); process.exit(fail ? 1 : 0);
})();
