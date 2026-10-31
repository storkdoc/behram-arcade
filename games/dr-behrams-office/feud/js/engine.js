/* FEUD & DELIVERY: rules engine (pure, no DOM). Works in browsers (window.FeudEngine) and in Node (require). */
(function (root) {
  'use strict';

  // ---------- text normalisation & fuzzy matching ----------
  var GENERIC = { the: 1, a: 1, an: 1, of: 1, and: 1, or: 1, in: 1, with: 1, to: 1, my: 1, her: 1, disease: 1, syndrome: 1,
    disorder: 1, infection: 1, pregnancy: 1, uterine: 1, vaginal: 1, cervical: 1, ovarian: 1, pain: 1, normal: 1,
    other: 1, cyst: 1, uterus: 1, ovary: 1, bleeding: 1, blood: 1, hormone: 1, source: 1, change: 1, problem: 1, issue: 1, tumor: 1, cancer: 1, fetal: 1, maternal: 1, chronic: 1, acute: 1, primary: 1, secondary: 1, it: 1, is: 1 };

  function normalize(s) {
    s = String(s == null ? '' : s).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/&/g, ' and ').replace(/['’`]s\b/g, 's').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (!s) return '';
    return s.split(/\s+/).map(function (t) {
      if (t.length > 4 && /s$/.test(t) && !/(ss|us|is|ys)$/.test(t)) return t.slice(0, -1);
      return t;
    }).join(' ');
  }

  // Damerau-Levenshtein (optimal string alignment), early exit above max
  function dist(a, b, max) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = [i]; var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }
  function allowance(len) { return len <= 4 ? 0 : len <= 7 ? 1 : len <= 12 ? 2 : 3; }
  function hasSpecific(n) { return n.split(' ').some(function (t) { return t.length > 2 && !GENERIC[t]; }); }

  // candidate lists, cached per round
  function cands(round) {
    if (round._c) return round._c;
    var out = round.a.map(function (ans) {
      var list = [ans[0], ans[0].replace(/\([^)]*\)/g, '')].concat(ans[2] || []);
      var frags = ans[0].split(/[\/(),]/).map(normalize).filter(function (f) { return f.length >= 4 && hasSpecific(f) && !/^(etc|e g|other|others)\b/.test(f); });
      var seen = {}, res = [];
      list.forEach(function (x) { var n = normalize(x); if (n && n.length >= 2 && !seen[n]) { seen[n] = 1; res.push(n); } });
      frags.forEach(function (n) { if (!seen[n]) { seen[n] = 1; res.push(n); } });
      return res;
    });
    try { Object.defineProperty(round, '_c', { value: out, enumerable: false }); } catch (e) { /* frozen */ }
    return out;
  }

  // generic matcher over [[candidates...], ...] -> index or -1
  function bestIndex(lists, n) {
    var i, j, c;
    for (i = 0; i < lists.length; i++) if (lists[i].indexOf(n) >= 0) return i;          // 1 exact
    var pad = ' ' + n + ' ', best = -1, bestLen = 0;
    for (i = 0; i < lists.length; i++) for (j = 0; j < lists[i].length; j++) {           // 2 input contains a synonym
      c = lists[i][j];
      if (c.length >= 2 && c.length > bestLen && pad.indexOf(' ' + c + ' ') >= 0 && (c.length >= 4 || c.indexOf(' ') < 0)) {
        if (c.length < 3 && n.split(' ').length > 3) continue;                          // tiny acronyms only in short inputs
        if (!hasSpecific(c) && c.length < 6 && GENERIC[c]) continue;
        best = i; bestLen = c.length;
      }
    }
    if (best >= 0) return best;
    if (n.length >= 7 && hasSpecific(n)) {                                             // 3 synonym contains input
      for (i = 0; i < lists.length; i++) for (j = 0; j < lists[i].length; j++)
        if ((' ' + lists[i][j] + ' ').indexOf(pad) >= 0) return i;
    }
    var bestD = 99; best = -1;                                                         // 4 fuzzy
    for (i = 0; i < lists.length; i++) for (j = 0; j < lists[i].length; j++) {
      c = lists[i][j]; if (c.length < 5 || c[0] !== n[0]) continue;
      var al = allowance(Math.min(c.length, n.length));
      if (!al) continue;
      var d = dist(n, c, al);
      if (d <= al && d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ---------- joke differentials: NEVER board answers ----------
  var GAGS = [
    { id: 'mercury', keys: ['mercury in retrograde', 'mercury retrograde', 'retrograde', 'mercury', 'the planets', 'astrology', 'horoscope', 'zodiac'], fx: 'trombone',
      say: 'Mercury in retrograde? The only thing in retrograde is that answer.' },
    { id: 'greys', keys: ['too much greys anatomy', 'greys anatomy', 'grey anatomy', 'greys', 'mcdreamy', 'grey s anatomy'], fx: 'scratch',
      say: 'Too much Grey\'s Anatomy? Nobody in that hospital has ever finished a shift.' },
    { id: 'webmd', keys: ['webmd said so', 'webmd', 'web md', 'symptom checker'], fx: 'trombone',
      say: 'WebMD said so? WebMD also thinks a hangnail is terminal.' },
    { id: 'google', keys: ['dr google', 'doctor google', 'google', 'googled it', 'i googled it', 'the internet'], fx: 'boing',
      say: 'Dr. Google is not board-certified. I checked. Twice.' },
    { id: 'ai', keys: ['chatgpt', 'chat gpt', 'ai said so', 'the ai', 'artificial intelligence', 'a chatbot', 'chatbot', 'the robot'], fx: 'boing',
      say: 'The chatbot said so? It also told me pizza is a vegetable.' },
    { id: 'moon', keys: ['full moon', 'the moon', 'moon', 'lunar'], fx: 'whistle',
      say: 'Full moon! Ask any L&D nurse and they will agree. The survey will not.' },
    { id: 'vibes', keys: ['bad vibes', 'vibes', 'bad energy', 'the vibes', 'bad juju', 'juju'], fx: 'trombone',
      say: 'Vibes are not a diagnosis. Even very strong vibes.' },
    { id: 'stork', keys: ['the stork', 'stork', 'stork delivery', 'stork malfunction'], fx: 'whistle',
      say: 'The stork? I deliver babies for a living. The stork has never once helped.' },
    { id: 'zebra', keys: ['zebra', 'zebras', 'hoofbeats', 'horses', 'a zebra', 'unicorn'], fx: 'boing',
      say: 'When you hear hoofbeats, think horses. You went straight to the safari.' },
    { id: 'aliens', keys: ['aliens', 'alien', 'alien abduction', 'ufo', 'martians', 'probed'], fx: 'scratch',
      say: 'Aliens. Okay. I will order the extraterrestrial panel. It is not covered.' },
    { id: 'ghost', keys: ['ghost', 'ghosts', 'haunted', 'poltergeist', 'possessed', 'curse', 'cursed', 'hex'], fx: 'whistle',
      say: 'Haunted? The only thing haunting this clinic is the fax machine.' },
    { id: 'house', keys: ['dr house', 'doctor house', 'house md', 'gregory house', 'house'], fx: 'scratch',
      say: 'Dr. House would order eleven tests and a break-in. Survey says no.' },
    { id: 'monday', keys: ['mondays', 'monday', 'its monday', 'a case of the mondays'], fx: 'trombone',
      say: 'A case of the Mondays. Very common. Not in the textbook.' },
    { id: 'spicy', keys: ['spicy food', 'spicy', 'hot sauce', 'tacos', 'curry'], fx: 'boing',
      say: 'Spicy food gets blamed for everything. Nice try, salsa.' },
    { id: 'pineapple', keys: ['pineapple', 'pineapples', 'eating pineapple', 'castor oil', 'bumpy car ride', 'walking'], fx: 'whistle',
      say: 'Pineapple! Every patient has tried it. Every board says NOPE.' },
    { id: 'loans', keys: ['student loans', 'student loan', 'student debt', 'loans', 'debt'], fx: 'trombone',
      say: 'Student loans cause pain, sure. Chronic, but not pelvic.' },
    { id: 'intern', keys: ['blame the intern', 'the intern', 'intern', 'the resident', 'blame the resident', 'the med student'], fx: 'scratch',
      say: 'Blame the intern? The intern is doing their best and also has not slept.' },
    { id: 'idk', keys: ['idk', 'i dont know', 'dont know', 'no idea', 'dunno', 'no clue', 'pass', 'um', 'uhh', 'uh', 'umm', 'hmm'], fx: 'trombone',
      say: 'Honesty! I respect it. The board does not.' },
    { id: 'choc', keys: ['chocolate deficiency', 'not enough chocolate', 'chocolate', 'needs chocolate', 'needs a nap', 'naptime deficiency'], fx: 'boing',
      say: 'Chocolate deficiency. Treatable, delicious, and sadly not on the board.' },
    { id: 'priorauth', keys: ['prior authorization', 'prior auth', 'insurance', 'insurance denial', 'the insurance company', 'billing'], fx: 'scratch',
      say: 'Prior authorization! The true cause of all suffering. Not this round, though.' },
    { id: 'fax', keys: ['the fax machine', 'fax machine', 'fax', 'the printer', 'printer', 'epic downtime', 'the computer'], fx: 'whistle',
      say: 'The fax machine. Ancient. Powerful. Not a diagnosis.' }
  ];
  var GAG_LISTS = GAGS.map(function (g) { return g.keys.map(normalize); });

  function matchGag(n) {
    if (!n) return null;
    var i, j;
    for (i = 0; i < GAG_LISTS.length; i++) if (GAG_LISTS[i].indexOf(n) >= 0) return GAGS[i];
    var pad = ' ' + n + ' ';
    for (i = 0; i < GAG_LISTS.length; i++) for (j = 0; j < GAG_LISTS[i].length; j++) {
      var k = GAG_LISTS[i][j];
      if (k.length >= 4 && pad.indexOf(' ' + k + ' ') >= 0) return GAGS[i];
    }
    for (i = 0; i < GAG_LISTS.length; i++) for (j = 0; j < GAG_LISTS[i].length; j++) {
      var c = GAG_LISTS[i][j]; if (c.length < 6 || c[0] !== n[0]) continue;
      var al = allowance(c.length); if (dist(n, c, al) <= al) return GAGS[i];
    }
    return null;
  }

  /* match(round, input, revealed) -> {type:'hit'|'dupe'|'gag'|'miss'|'empty', idx?, gag?, n} */
  function match(round, input, revealed) {
    revealed = revealed || [];
    if (input && typeof input === 'object') {
      if (input.strike) return { type: 'miss', host: true, n: '' };
      if (typeof input.idx === 'number') return revealed[input.idx] ? { type: 'dupe', idx: input.idx, host: true } : { type: 'hit', idx: input.idx, host: true };
    }
    var n = normalize(input);
    if (!n) return { type: 'empty', n: n };
    var idx = bestIndex(cands(round), n);
    if (idx >= 0) return { type: revealed[idx] ? 'dupe' : 'hit', idx: idx, n: n };
    var g = matchGag(n);
    if (g) return { type: 'gag', gag: g, n: n };
    return { type: 'miss', n: n };
  }

  var MULT = [1, 1, 2, 3];
  function other(s) { return s === 0 ? 1 : 0; }

  // ---------- one board round ----------
  // phases: 'faceoff' -> 'playOrPass' -> 'play' -> ('steal') -> 'done'
  function Round(round, mult) {
    this.r = round; this.mult = mult || 1;
    this.revealed = round.a.map(function () { return false; });
    this.revealedBy = round.a.map(function () { return null; });
    this.phase = 'faceoff'; this.bank = 0; this.strikes = 0; this.control = null;
    this.fo = { first: null, firstIdx: null, firstDone: false, winner: null };
    this.winner = null; this.awarded = 0; this.stealResult = null;
  }
  Round.prototype.pts = function (i) { return this.r.a[i][1]; };
  Round.prototype.remaining = function () { return this.revealed.filter(function (x) { return !x; }).length; };
  Round.prototype._reveal = function (i, side) {
    this.revealed[i] = true; this.revealedBy[i] = side; this.bank += this.pts(i);
  };
  Round.prototype.buzz = function (side) {
    if (this.phase !== 'faceoff' || this.fo.first !== null) return false;
    this.fo.first = side; return true;
  };
  // who must answer next in the face-off
  Round.prototype.faceoffTurn = function () {
    if (this.phase !== 'faceoff' || this.fo.first === null) return null;
    return this.fo.firstDone ? other(this.fo.first) : this.fo.first;
  };
  Round.prototype.faceoffAnswer = function (input) {
    var side = this.faceoffTurn();
    if (side === null) throw new Error('no face-off turn');
    var res = match(this.r, input, this.revealed);
    if (res.type === 'empty') return { res: res, side: side, retry: true };
    if (res.type === 'dupe') return { res: res, side: side, retry: true };
    var hit = res.type === 'hit';
    if (hit) this._reveal(res.idx, side);
    var out = { res: res, side: side, decided: null, again: false };
    if (!this.fo.firstDone) {
      this.fo.firstDone = true; this.fo.firstIdx = hit ? res.idx : null;
      if (hit && res.idx === 0) out.decided = side;           // #1 answer wins outright
    } else {
      var a = this.fo.firstIdx;
      if (hit && (a === null || res.idx < a)) out.decided = side;
      else if (a !== null) out.decided = other(side);
      else { out.again = true; this.fo = { first: null, firstIdx: null, firstDone: false, winner: null }; }
    }
    if (out.decided !== null) { this.fo.winner = out.decided; this.phase = 'playOrPass'; }
    if (!this.remaining()) { this.control = out.decided !== null ? out.decided : side; this._finish(this.control); out.done = true; }
    return out;
  };
  Round.prototype.choose = function (play) {
    if (this.phase !== 'playOrPass') throw new Error('not play/pass');
    this.control = play ? this.fo.winner : other(this.fo.winner);
    this.phase = 'play'; return this.control;
  };
  Round.prototype.playAnswer = function (input) {
    if (this.phase !== 'play') throw new Error('not in play');
    var res = match(this.r, input, this.revealed);
    if (res.type === 'empty' || res.type === 'dupe') return { res: res, retry: true, strikes: this.strikes };
    var out = { res: res, strikes: this.strikes };
    if (res.type === 'hit') {
      this._reveal(res.idx, this.control);
      if (!this.remaining()) { this._finish(this.control); out.done = true; out.winner = this.control; }
    } else {
      this.strikes++; out.strikes = this.strikes; out.strike = true;
      if (this.strikes >= 3) { this.phase = 'steal'; out.toSteal = other(this.control); }
    }
    return out;
  };
  Round.prototype.stealAnswer = function (input) {
    if (this.phase !== 'steal') throw new Error('not steal');
    var thief = other(this.control);
    var res = match(this.r, input, this.revealed);
    if (res.type === 'empty' || res.type === 'dupe') return { res: res, retry: true };
    var ok = res.type === 'hit';
    if (ok) this._reveal(res.idx, thief);
    this.stealResult = ok;
    this._finish(ok ? thief : this.control);
    return { res: res, stolen: ok, winner: this.winner, done: true };
  };
  Round.prototype._finish = function (side) {
    this.phase = 'done'; this.winner = side; this.awarded = this.bank * this.mult;
  };

  // ---------- match: 4 rounds (x1, x1, x2, x3) + sudden death ----------
  function Match(opts) {
    opts = opts || {};
    this.names = opts.names || ['Team A', 'Team B'];
    this.mult = opts.mult || MULT;
    this.scores = [0, 0]; this.history = []; this.idx = -1; this.round = null; this.sudden = false;
  }
  Match.prototype.start = function (roundData) {
    this.idx++;
    this.sudden = this.idx >= this.mult.length;
    var m = this.sudden ? this.mult[this.mult.length - 1] : this.mult[this.idx];
    this.round = new Round(roundData, m); return this.round;
  };
  Match.prototype.multiplier = function () { return this.round ? this.round.mult : this.mult[0]; };
  Match.prototype.commit = function () {
    var r = this.round; if (!r || r.phase !== 'done' || r._committed) return null;
    r._committed = true; this.scores[r.winner] += r.awarded;
    this.history.push({ id: r.r.id, winner: r.winner, pts: r.awarded });
    return { winner: r.winner, pts: r.awarded };
  };
  // sudden death is decided by the face-off alone
  Match.prototype.commitSudden = function () {
    var r = this.round; if (!r || r.fo.winner === null || r._committed) return null;
    r._committed = true; r.winner = r.fo.winner; r.awarded = r.bank * r.mult; r.phase = 'done';
    this.scores[r.winner] += r.awarded; this.history.push({ id: r.r.id, winner: r.winner, pts: r.awarded, sudden: true });
    return { winner: r.winner, pts: r.awarded };
  };
  Match.prototype.over = function () {
    return this.history.length >= this.mult.length && this.scores[0] !== this.scores[1];
  };
  Match.prototype.needsSudden = function () {
    return this.history.length >= this.mult.length && this.scores[0] === this.scores[1];
  };
  Match.prototype.leader = function () {
    return this.scores[0] === this.scores[1] ? null : (this.scores[0] > this.scores[1] ? 0 : 1);
  };

  // ---------- Fast Money ----------
  function FastMoney(prompts, opts) {
    opts = opts || {};
    this.prompts = prompts; this.target = opts.target || 200; this.times = opts.times || [20, 25];
    this.ans = [prompts.map(function () { return null; }), prompts.map(function () { return null; })];
  }
  // returns {type:'hit'|'gag'|'miss'|'dupe'|'empty', pts, idx?}; dupe = same board slot as seat 1 -> try again
  FastMoney.prototype.submit = function (seat, i, input) {
    var r = this.prompts[i];
    var res = match(r, input, []);
    if (res.type === 'empty') return { type: 'empty', pts: 0 };
    if (seat === 1 && res.type === 'hit') {
      var p = this.ans[0][i];
      if (p && p.type === 'hit' && p.idx === res.idx) return { type: 'dupe', pts: 0, idx: res.idx };
    }
    var rec = { type: res.type === 'hit' ? 'hit' : res.type, idx: res.idx, pts: res.type === 'hit' ? r.a[res.idx][1] : 0,
      text: String(input), label: res.type === 'hit' ? r.a[res.idx][0] : null, gag: res.gag || null };
    this.ans[seat][i] = rec; return rec;
  };
  FastMoney.prototype.pass = function (seat, i) {
    if (!this.ans[seat][i]) this.ans[seat][i] = { type: 'pass', pts: 0, passed: true };
    return this.ans[seat][i];
  };
  FastMoney.prototype.open = function (seat) {   // indexes still unanswered or passed
    var out = []; this.ans[seat].forEach(function (a, i) { if (!a || a.type === 'pass') out.push(i); }); return out;
  };
  FastMoney.prototype.seatTotal = function (seat) {
    return this.ans[seat].reduce(function (s, a) { return s + (a ? a.pts : 0); }, 0);
  };
  FastMoney.prototype.total = function () { return this.seatTotal(0) + this.seatTotal(1); };
  FastMoney.prototype.won = function () { return this.total() >= this.target; };

  // ---------- simulated rival (solo mode) ----------
  var LEVELS = { easy: { p: 0.45, buzz: [2200, 4200] }, normal: { p: 0.6, buzz: [1500, 3400] }, hard: { p: 0.75, buzz: [1000, 2400] } };
  function rng0() { return Math.random(); }
  function rivalBuzzDelay(level, rng) {
    var L = LEVELS[level] || LEVELS.normal; rng = rng || rng0;
    return Math.round(L.buzz[0] + rng() * (L.buzz[1] - L.buzz[0]));
  }
  // returns {text, idx|null}: idx = intended board slot, or null for a plausible wrong answer
  function rivalGuess(round, revealed, level, rng, pool) {
    var L = LEVELS[level] || LEVELS.normal; rng = rng || rng0;
    var open = []; round.a.forEach(function (a, i) { if (!revealed[i]) open.push(i); });
    if (open.length && rng() < L.p) {
      var tot = open.reduce(function (s, i) { return s + round.a[i][1] + 6; }, 0), x = rng() * tot;
      for (var k = 0; k < open.length; k++) { x -= round.a[open[k]][1] + 6; if (x <= 0) break; }
      var idx = open[Math.min(k, open.length - 1)];
      return { text: round.a[idx][0], idx: idx };
    }
    pool = (pool || []).filter(function (t) { return bestIndex(cands(round), normalize(t)) < 0; });
    var t = pool.length ? pool[Math.floor(rng() * pool.length)] : 'Appendicitis';
    if (bestIndex(cands(round), normalize(t)) >= 0) t = 'Kidney stone';
    return { text: t, idx: null };
  }

  // ---------- helpers ----------
  function vocab(rounds) {      // autocomplete list from ALL rounds (does not reveal the current board)
    var seen = {}, out = [];
    rounds.forEach(function (r) {
      r.a.forEach(function (a) {
        [a[0].replace(/\s*\([^)]*\)\s*/g, ' ').trim(), a[0]].forEach(function (s) {
          var k = normalize(s); if (k && !seen[k]) { seen[k] = 1; out.push(s); }
        });
      });
    });
    return out.sort();
  }
  function Bag(items, rng) { this.items = items.slice(); this.rng = rng || rng0; this.pool = []; this.last = null; }
  Bag.prototype.next = function () {
    if (!this.pool.length) {
      this.pool = this.items.slice();
      for (var i = this.pool.length - 1; i > 0; i--) { var j = Math.floor(this.rng() * (i + 1)); var t = this.pool[i]; this.pool[i] = this.pool[j]; this.pool[j] = t; }
      if (this.pool.length > 1 && this.pool[this.pool.length - 1] === this.last) this.pool.unshift(this.pool.pop());
    }
    this.last = this.pool.pop(); return this.last;
  };
  function shuffle(a, rng) {
    a = a.slice(); rng = rng || rng0;
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  var api = { normalize: normalize, dist: dist, match: match, matchGag: matchGag, GAGS: GAGS, MULT: MULT, Round: Round,
    Match: Match, FastMoney: FastMoney, LEVELS: LEVELS, rivalGuess: rivalGuess, rivalBuzzDelay: rivalBuzzDelay,
    vocab: vocab, Bag: Bag, shuffle: shuffle, other: other };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FeudEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
