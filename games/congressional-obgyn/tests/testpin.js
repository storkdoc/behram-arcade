// Test helper: lets the tests exercise the instructor PIN without the real PIN ever being written in the repo.
// - COB_PIN=<pin> in the environment: use the real PIN and the real hash in js/access.js.
// - otherwise: a throwaway TEST PIN; its salted hash replaces PIN_HASH in an in-memory copy of access.js
//   (node: loadAccess(); browser: patchedAccessSource() for page.route).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FILE = path.join(__dirname, '..', 'js', 'access.js');
const real = !!process.env.COB_PIN;
const PIN = real ? String(process.env.COB_PIN).replace(/\D/g, '') : '4826';
function patchedAccessSource() {
  const src = fs.readFileSync(FILE, 'utf8');
  if (real) return src;
  const salt = /PIN_SALT = '([0-9a-f]+)'/.exec(src)[1];
  const h = crypto.createHash('sha256').update('cob-pin|' + salt + '|' + PIN).digest('hex');
  return src.replace(/PIN_HASH = '[0-9a-f]{64}'/, "PIN_HASH = '" + h + "'");
}
function loadAccess() {
  const m = { exports: {} };
  new Function('module', 'exports', 'require', patchedAccessSource())(m, m.exports, require);
  return m.exports;
}
function scanFor(s) {
  const hits = [], root = path.join(__dirname, '..');
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p);
    if (st.isDirectory()) walk(p); else if (/\.(js|html|css|md|json|txt|mjs)$/.test(f) && fs.readFileSync(p, 'utf8').includes(s)) hits.push(path.relative(root, p)); } })(root);
  return hits;
}
module.exports = { PIN, real, patchedAccessSource, loadAccess, scanFor };
