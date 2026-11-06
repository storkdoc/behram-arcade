/* NAME THAT GROOVE: rounds, questions and scoring (pure, seeded, testable in Node). */
(function (root) {
  'use strict';
  const C = (typeof module !== 'undefined' && module.exports) ? require('./catalog.js') : root.NTG_Catalog;
  const ROUND_LEN = 10, CHOICES = 4;
  const DIFFS = {
    easy: { label: 'EASY', artist: true, sameGenre: 0, blurb: 'Every choice shows the song and the artist. Decoys are different kinds of songs.' },
    normal: { label: 'NORMAL', artist: false, sameGenre: 0, blurb: 'Song titles only. Name it from the music.' },
    hard: { label: 'CRATE DIGGER', artist: false, sameGenre: 1, blurb: 'Song titles only, and one decoy from the same genre.' }
  };

  function usable(list, exclude) { return exclude && exclude.size ? list.filter(s => !exclude.has(s.id)) : list; }

  // Pick the songs for a round. ALL mode splits the round 4/3/3 across the decades (random order).
  // Everything not picked becomes the spare pile used when a video won't play.
  function pickSongs(r, mode, n, exclude) {
    if (mode !== 'all') { const all = C.shuffle(r, usable(C.songsFor(mode), exclude)); return { songs: all.slice(0, n), spares: all.slice(n) }; }
    const decs = C.shuffle(r, C.DECADES), out = [], spares = [];
    const counts = [Math.ceil(n / 3), Math.round(n / 3), n - Math.ceil(n / 3) - Math.round(n / 3)];
    decs.forEach((d, i) => { const all = C.shuffle(r, usable(C.songsFor(d), exclude)); out.push(...all.slice(0, counts[i])); spares.push(...all.slice(counts[i])); });
    return { songs: C.shuffle(r, out), spares: C.shuffle(r, spares) };
  }

  // Decoys come from the same decade, never the same artist, with comparable title lengths, and at least
  // one decoy is as long or longer than the answer, so the right answer is never the stand-out longest.
  function pickDistractors(r, ans, diff) {
    const D = DIFFS[diff] || DIFFS.normal;
    const pool = C.songsFor(ans.decade).filter(s => s.id !== ans.id && s.artist !== ans.artist);
    const L = ans.title.length;
    const band = s => { const d = Math.abs(s.title.length - L); return d <= 5 ? 0 : d <= 9 ? 1 : 2; };
    const near = list => C.shuffle(r, list).sort((a, b) => band(a) - band(b));
    const chosen = [], artists = new Set([ans.artist]);
    const add = s => { chosen.push(s); artists.add(s.artist); };
    const free = s => !chosen.includes(s) && !artists.has(s.artist);
    if (D.sameGenre) { const same = near(pool.filter(s => s.genre === ans.genre)); if (same.length) add(same[0]); }
    const others = pool.filter(s => D.sameGenre ? s.genre !== ans.genre : true);
    if (!chosen.some(s => s.title.length >= L)) {
      const longer = near(others.filter(s => s.title.length >= L && s.title.length <= L + 8 && free(s))).concat(near(others.filter(s => s.title.length > L + 8 && free(s))));
      if (longer.length) add(longer[Math.floor(r() * Math.min(3, longer.length))]);
    }
    for (const s of near(others)) { if (chosen.length >= CHOICES - 1) break; if (free(s)) add(s); }
    for (const s of near(pool)) { if (chosen.length >= CHOICES - 1) break; if (!chosen.includes(s)) add(s); } // safety net
    return chosen;
  }

  function makeQuestion(r, ans, pos, diff, n) {
    const decoys = C.shuffle(r, pickDistractors(r, ans, diff));
    const choices = decoys.slice(); choices.splice(pos, 0, ans);
    return { n, answer: ans.id, correct: pos, choices: choices.map(s => s.id), decade: ans.decade, genre: ans.genre };
  }

  function makeRound(opts) {
    const mode = opts.mode || 'all', diff = opts.diff || 'normal', n = opts.n || ROUND_LEN;
    const seed = (opts.seed === undefined ? Math.floor(Math.random() * 2 ** 31) : opts.seed) >>> 0;
    const r = C.rng(seed ^ C.hash(mode + '/' + diff));
    const { songs, spares } = pickSongs(r, mode, n, opts.exclude);
    // answer positions come from a shuffled bag (each slot used 2-3 times in a 10-question round)
    let bag = [];
    const questions = songs.map((ans, qi) => {
      if (!bag.length) bag = C.shuffle(r, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
      return makeQuestion(r, ans, bag.pop(), diff, qi + 1);
    });
    return { seed, mode, diff, questions, spares: spares.map(s => s.id) };
  }

  // A video won't play: swap in a spare song from the same decade, keeping the answer slot. Returns false if none left.
  function swapQuestion(round, qi, bad) {
    const q = round.questions[qi]; if (!q) return false;
    const used = new Set(round.questions.map(x => x.answer));
    const k = round.spares.findIndex(id => !used.has(id) && !(bad && bad.has(id)) && C.byId(id).decade === q.decade);
    if (k < 0) return false;
    const id = round.spares.splice(k, 1)[0];
    const r = C.rng((round.seed ^ C.hash(id)) >>> 0);
    round.questions[qi] = makeQuestion(r, C.byId(id), q.correct, round.diff, q.n);
    round.questions[qi].swapped = (q.swapped || 0) + 1;
    return true;
  }

  // 50:50 hint: removes two wrong answers (seeded so it is repeatable)
  function fiftyFifty(q, seed) { const r = C.rng((seed >>> 0) ^ (q.n * 7919) ^ C.hash(q.answer)); const wrong = q.choices.map((_, i) => i).filter(i => i !== q.correct); return C.shuffle(r, wrong).slice(0, 2).sort(); }

  /* Score one answer.  base 100 + speed bonus (up to 150, falls linearly to 0 by the end of the clip),
     halved if the 50:50 was used, then times the streak multiplier (x1, x1.25 ... up to x2 on 5 in a row).
     "elapsed" is seconds of song actually heard, so loading or anything YouTube shows first costs nothing. */
  const BASE = 100, SPEED = 150;
  function scoreAnswer({ correct, elapsed, clipLen, streak, hinted }) {
    if (!correct) return { base: 0, speed: 0, mult: 1, total: 0, streak: 0 };
    const ns = (streak || 0) + 1;
    const speed = Math.round(SPEED * Math.max(0, Math.min(1, 1 - elapsed / Math.max(0.001, clipLen))));
    const mult = 1 + 0.25 * Math.min(ns - 1, 4);
    const raw = (BASE + speed) * (hinted ? 0.5 : 1);
    return { base: BASE, speed, mult, total: Math.round(raw * mult), streak: ns };
  }
  const MAX_ROUND = (() => { let s = 0, st = 0; for (let i = 0; i < ROUND_LEN; i++) { const a = scoreAnswer({ correct: true, elapsed: 0, clipLen: 1, streak: st }); s += a.total; st = a.streak; } return s; })();

  function rankFor(score, acc) {
    if (acc >= 1 && score >= MAX_ROUND * 0.7) return 'PLATINUM EARS';
    if (acc >= 0.9) return 'GOLD RECORD';
    if (acc >= 0.7) return 'TOP 40 REGULAR';
    if (acc >= 0.5) return 'B-SIDE BUFF';
    if (acc >= 0.3) return 'RADIO SURFER';
    return 'NEEDS MORE SPINS';
  }

  // local high scores: top 5 per mode+difficulty (v2 keys: the real-song game starts a fresh table)
  function bestKey(mode, diff) { return 'ntg.best2.' + mode + '.' + diff; }
  function loadBest(store, mode, diff) { try { const v = JSON.parse(store.getItem(bestKey(mode, diff)) || '[]'); return Array.isArray(v) ? v.filter(e => e && typeof e.score === 'number').slice(0, 5) : []; } catch (e) { return []; } }
  function saveBest(store, mode, diff, entry) {
    const list = loadBest(store, mode, diff); list.push(entry); list.sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : 1));
    const top = list.slice(0, 5); try { store.setItem(bestKey(mode, diff), JSON.stringify(top)); } catch (e) { }
    return { list: top, rank: top.indexOf(entry) };
  }

  const api = { ROUND_LEN, CHOICES, DIFFS, makeRound, makeQuestion, swapQuestion, pickDistractors, fiftyFifty, scoreAnswer, MAX_ROUND, rankFor, loadBest, saveBest, bestKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NTG_Quiz = api;
})(typeof window !== 'undefined' ? window : this);
