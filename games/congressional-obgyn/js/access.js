/* CONGRESSIONAL OB GYN — access codes.
 * - Instructor PIN: only a salted SHA-256 hash is stored here (never the PIN itself).
 * - Student codes CONG-XXXX-XXXX: 40 bits = [20-bit masked payload (issue day 14b + nonce 6b)] [20-bit truncated HMAC-SHA256].
 *   Works offline. Valid for 42 days from the issue date (America/New_York calendar days).
 * HONEST CAVEAT: the HMAC key ships in this client file (lightly obfuscated). A determined person
 * with dev tools can mint codes or skip the gate. This is a classroom honor-system lock, not DRM. */
(function (root) {
  'use strict';
  var subtle = (root.crypto && root.crypto.subtle) || null;
  var ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 symbols, no 0/1/I/O
  var EPOCH = Date.UTC(2026, 0, 1) / 86400000;  // day 0 = 2026-01-01
  var VALID_DAYS = 42;
  var PIN_SALT = '8a73389d2393875386e56965';
  var PIN_HASH = 'e1ae9c19f37b8218f1edfe6a101b1fecd7a63e1577bd5fdc06bef18be528bf12';
  var K = [126,190,96,245,6,95,131,45,102,213,17,244,250,141,169,197,160,217,197,35,101,173,223,5];
  var keyP = null;
  function enc(s) { return new TextEncoder().encode(s); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function key() {
    if (!keyP) {
      var k = K.slice().reverse().map(function (b, i) { return b ^ ((i * 37 + 91) & 255); });
      keyP = subtle.importKey('raw', new Uint8Array(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    }
    return keyP;
  }
  function mac20(msg) {
    return key().then(function (k) { return subtle.sign('HMAC', k, enc(msg)); }).then(function (sig) {
      var b = new Uint8Array(sig); return ((b[0] << 12) | (b[1] << 4) | (b[2] >> 4)) & 0xFFFFF;
    });
  }
  function b32(n) { var s = ''; for (var i = 3; i >= 0; i--) s += ALPHA[(n >> (i * 5)) & 31]; return s; }
  function unb32(s) { var n = 0; for (var i = 0; i < 4; i++) { var v = ALPHA.indexOf(s[i]); if (v < 0) return -1; n = (n << 5) | v; } return n; }

  /* Day number of a calendar date in America/New_York (or of a given Date). */
  function nyDay(date) {
    var d = date || new Date();
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    } catch (e) { parts = null; }
    var y, m, dd;
    if (parts) { parts.forEach(function (p) { if (p.type === 'year') y = +p.value; if (p.type === 'month') m = +p.value; if (p.type === 'day') dd = +p.value; }); }
    else { var t = new Date(d.getTime() - 5 * 3600000); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; dd = t.getUTCDate(); }
    return Date.UTC(y, m - 1, dd) / 86400000 - EPOCH;
  }
  function dayToDate(day) { return new Date((day + EPOCH) * 86400000); }
  function fmtDay(day) {
    return dayToDate(day).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  }
  function normalize(code) {
    var s = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (s.indexOf('CONG') === 0) s = s.slice(4);
    s = s.replace(/O/g, '0').replace(/I/g, '1'); // forgiving typing; 0/1 are not in the alphabet so they fail cleanly
    return s;
  }
  function fmtCode(s8) { return 'CONG-' + s8.slice(0, 4) + '-' + s8.slice(4, 8); }

  /* Create a student code for a given issue day (default: today in New York). */
  function makeCode(issueDay, nonce) {
    if (issueDay == null) issueDay = nyDay();
    if (nonce == null) { var r = new Uint8Array(1); root.crypto.getRandomValues(r); nonce = r[0] & 63; }
    var payload = ((issueDay & 0x3FFF) << 6) | (nonce & 63);
    return mac20('COB1|' + issueDay + '|' + nonce).then(function (m) {
      return mac20('MASK|' + m).then(function (mask) {
        return { code: fmtCode(b32((payload ^ mask) & 0xFFFFF) + b32(m)), issueDay: issueDay, expiresDay: issueDay + VALID_DAYS };
      });
    });
  }
  /* Check a code. today = NY day number (default now). */
  function checkCode(code, today) {
    if (today == null) today = nyDay();
    var s = normalize(code);
    if (s.length !== 8) return Promise.resolve({ ok: false, reason: 'format' });
    var hi = unb32(s.slice(0, 4)), m = unb32(s.slice(4));
    if (hi < 0 || m < 0) return Promise.resolve({ ok: false, reason: 'format' });
    return mac20('MASK|' + m).then(function (mask) {
      var payload = (hi ^ mask) & 0xFFFFF, issue = payload >> 6, nonce = payload & 63;
      return mac20('COB1|' + issue + '|' + nonce).then(function (m2) {
        if (m2 !== m) return { ok: false, reason: 'invalid' };
        var age = today - issue, exp = issue + VALID_DAYS;
        var base = { issueDay: issue, expiresDay: exp, daysLeft: exp - today, code: fmtCode(s) };
        if (age < -1) return Object.assign(base, { ok: false, reason: 'future' });
        if (age >= VALID_DAYS) return Object.assign(base, { ok: false, reason: 'expired' });
        return Object.assign(base, { ok: true });
      });
    });
  }
  function checkPin(pin) {
    var p = String(pin || '').replace(/\D/g, '');
    if (!subtle) return Promise.resolve(false);
    return subtle.digest('SHA-256', enc('cob-pin|' + PIN_SALT + '|' + p)).then(function (h) { return hex(h) === PIN_HASH; });
  }
  /* Token remembering that the instructor unlocked this device (not the PIN). */
  function instructorToken() { return mac20('INSTRUCTOR|v1').then(function (m) { return 'I' + m.toString(36); }); }

  var api = { makeCode: makeCode, checkCode: checkCode, checkPin: checkPin, instructorToken: instructorToken,
    nyDay: nyDay, fmtDay: fmtDay, normalize: normalize, VALID_DAYS: VALID_DAYS, available: !!subtle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COBAccess = api;
})(typeof window !== 'undefined' ? window : globalThis);
