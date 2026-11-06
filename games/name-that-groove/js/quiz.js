/* NAME THAT GROOVE: rounds, questions and scoring (pure, seeded, testable in Node). */
(function (root) {
  'use strict';
  const C = (typeof module !== 'undefined' && module.exports) ? require('./catalog.js') : root.NTG_Catalog;
  const ROUND_LEN = 10, CHOICES = 4;
  const DIFFS = {
    easy: { label: 'EASY', tags: true, sameStyle: 0, blurb: 'Four different styles, with style tags on the answers.' },
    normal: { label: 'NORMAL', tags: false, sameStyle: 0, blurb: 'Four different styles, no tags. Trust your ears.' },
    hard: { label: 'CRATE DIGGER', tags: false, sameStyle: 1, blurb: 'One decoy shares the style. Learn the hooks in the Record Crate.' }
  };

  // Pick the songs for a round. ALL mode splits the round 4/3/3 across the decades (random order).
  function pickSongs(r, mode, n) {
    if (mode !== 'all') return C.shuffle(r, C.songsFor(mode)).slice(0, n);
    const decs = C.shuffle(r, C.DECADES), out = [];
    const counts = [Math.ceil(n / 3), Math.round(n / 3), n - Math.ceil(n / 3) - Math.round(n / 3)];
    decs.forEach((d, i) => out.push(...C.shuffle(r, C.songsFor(d)).slice(0, counts[i])));
    return C.shuffle(r, out);
  }

  // Distractors: comparable title lengths, and at least one decoy is as long or longer than the answer,
  // so the right answer is never the stand-out longest option.
  function pickDistractors(r, ans, mode, diff) {
    const D = DIFFS[diff] || DIFFS.normal;
    const pool = (mode === 'all' ? C.SONGS.filter(s => s.decade === ans.decade || r() < 0.5) : C.songsFor(ans.decade)).filter(s => s.id !== ans.id);
    const L = ans.title.length;
    const band = s => { const d = Math.abs(s.title.length - L); return d <= 4 ? 0 : d <= 7 ? 1 : 2; };
    const near = (list) => C.shuffle(r, list).sort((a, b) => band(a) - band(b));
    const chosen = [], styles = new Set([ans.style]);
    if (D.sameStyle) { const same = near(pool.filter(s => s.style === ans.style)); if (same.length) { chosen.push(same[0]); } }
    const others = pool.filter(s => s.style !== ans.style);
    // first decoy: one at least as long as the answer (closest such), when the crate has one
    const longer = near(others.filter(s => s.title.length >= L && s.title.length <= L + 6)).concat(near(others.filter(s => s.title.length > L + 6)));
    if (!chosen.some(s => s.title.length >= L) && longer.length) { const s = longer[Math.floor(r() * Math.min(3, longer.length))]; chosen.push(s); styles.add(s.style); }
    for (const s of near(others)) {
      if (chosen.length >= CHOICES - 1) break;
      if (chosen.includes(s) || styles.has(s.style)) continue;
      if (Math.abs(s.title.length - L) > 7 && near(others).some(o => !chosen.includes(o) && !styles.has(o.style) && Math.abs(o.title.length - L) <= 7)) continue;
      chosen.push(s); styles.add(s.style);
    }
    for (const s of near(pool)) { if (chosen.length >= CHOICES - 1) break; if (!chosen.includes(s)) chosen.push(s); } // safety net
    return chosen;
  }

  function makeRound(opts) {
    const mode = opts.mode || 'all', diff = opts.diff || 'normal', n = opts.n || ROUND_LEN;
    const seed = (opts.seed === undefined ? Math.floor(Math.random() * 2 ** 31) : opts.seed) >>> 0;
    const r = C.rng(seed ^ C.hash(mode + '/' + diff));
    const songs = pickSongs(r, mode, n);
    // answer positions come from a shuffled bag (each slot used 2-3 times in a 10-question round)
    let bag = [];
    const questions = songs.map((ans, qi) => {
      if (!bag.length) bag = C.shuffle(r, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
      const pos = bag.pop();
      const decoys = C.shuffle(r, pickDistractors(r, ans, mode, diff));
      const choices = decoys.slice(); choices.splice(pos, 0, ans);
      return { n: qi + 1, answer: ans.id, correct: pos, choices: choices.map(s => s.id), decade: ans.decade, style: ans.style };
    });
    return { seed, mode, diff, questions };
  }

  // 50:50 hint: removes two wrong answers (seeded so it is repeatable)
  function fiftyFifty(q, seed) { const r = C.rng((seed >>> 0) ^ (q.n * 7919)); const wrong = q.choices.map((_, i) => i).filter(i => i !== q.correct); return C.shuffle(r, wrong).slice(0, 2).sort(); }

  /* Score one answer.  base 100 + speed bonus (up to 150, falls linearly to 0 by the end of the clip),
     halved if the 50:50 was used, then times the streak multiplier (x1, x1.25 ... up to x2 on 5 in a row). */
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

  // local high scores: top 5 per mode+difficulty
  function bestKey(mode, diff) { return 'ntg.best.' + mode + '.' + diff; }
  function loadBest(store, mode, diff) { try { const v = JSON.parse(store.getItem(bestKey(mode, diff)) || '[]'); return Array.isArray(v) ? v.filter(e => e && typeof e.score === 'number').slice(0, 5) : []; } catch (e) { return []; } }
  function saveBest(store, mode, diff, entry) {
    const list = loadBest(store, mode, diff); list.push(entry); list.sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : 1));
    const top = list.slice(0, 5); try { store.setItem(bestKey(mode, diff), JSON.stringify(top)); } catch (e) { }
    return { list: top, rank: top.indexOf(entry) };
  }

  const api = { ROUND_LEN, CHOICES, DIFFS, makeRound, pickDistractors, fiftyFifty, scoreAnswer, MAX_ROUND, rankFor, loadBest, saveBest, bestKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NTG_Quiz = api;
})(typeof window !== 'undefined' ? window : this);
