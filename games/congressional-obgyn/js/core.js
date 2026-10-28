/* CONGRESSIONAL OB GYN — game rules: scoring, progression, mastery (spaced repetition), selection.
 * Pure logic (no DOM) so it can be unit-tested in node. */
(function (root) {
  'use strict';
  var LEVELS = [
    { n: 'MS3', xp: 0, title: 'Third-year medical student' },
    { n: 'Intern', xp: 2500, title: 'PGY-1 Intern' },
    { n: 'Resident', xp: 8000, title: 'OB/GYN Resident' },
    { n: 'Chief', xp: 18000, title: 'Chief Resident' },
    { n: 'Attending', xp: 35000, title: 'Attending Physician' }
  ];
  var INTERVALS = [0, 1, 3, 7, 14, 30]; // Leitner box -> days until review
  var BADGES = [
    ['first', 'First Patient', 'Complete your first encounter', 'stetho'],
    ['perfect', 'Textbook', 'Answer every question in an encounter correctly', 'book'],
    ['streak5', 'On a Roll', 'Reach a 5-answer streak', 'flame'],
    ['streak10', 'Unstoppable', 'Reach a 10-answer streak', 'rocket'],
    ['speed', 'Quick Draw', '5 correct answers under 8 seconds in one day', 'bolt'],
    ['fullday', 'Full Clinic', 'See every patient in a clinic day', 'clinic'],
    ['gradeA', 'Honors', 'Earn an A on a clinic day', 'medal'],
    ['daily', 'Daily Rounds', 'Finish a Daily Challenge', 'calendar'],
    ['ob', 'L&D Ready', 'Perfect an OB encounter', 'baby'],
    ['gyn', 'GYN Guru', 'Perfect a GYN encounter', 'flower'],
    ['solo', 'Independent', 'Finish a clinic day without asking Dr. Behram', 'shield'],
    ['happy', 'Bedside Manner', 'Every patient leaves with 5 hearts in a day', 'heart'],
    ['explorer', 'Explorer', 'See 15 different topics', 'map'],
    ['master', 'Topic Master', 'Reach top mastery in any topic', 'crown'],
    ['intern', 'Match Day', 'Reach Intern', 'cap'],
    ['resident', 'Resident', 'Reach Resident', 'cap'],
    ['chief', 'Chief', 'Reach Chief Resident', 'cap'],
    ['attending', 'Attending', 'Reach Attending', 'star']
  ];

  function rng(seed) { var s = seed >>> 0 || 7; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function shuffle(a, r) { r = r || Math.random; a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function newSave() {
    return { v: 1, name: '', xp: 0, badges: {}, mastery: {}, caseSeen: {}, board: [], daily: {}, best: 0,
      stats: { encounters: 0, perfect: 0, questions: 0, correct: 0, bestStreak: 0, days: 0, topics: {} } };
  }
  function levelOf(xp) { var i = 0; for (var k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k; return i; }
  function levelProgress(xp) {
    var i = levelOf(xp), cur = LEVELS[i], nxt = LEVELS[i + 1];
    return { idx: i, name: cur.n, title: cur.title, next: nxt ? nxt.n : null, frac: nxt ? (xp - cur.xp) / (nxt.xp - cur.xp) : 1, toNext: nxt ? nxt.xp - xp : 0 };
  }
  function maxTier(save, instructor) { return instructor ? 3 : Math.min(3, levelOf(save.xp)); }

  function multiplier(streak) { return streak >= 8 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1; }
  /* points for one answer. secs = time to answer. streak = streak INCLUDING this answer. */
  function scoreAnswer(correct, secs, streak, usedHint) {
    if (!correct) return { base: 0, speed: 0, mult: 1, total: 0 };
    var speed = Math.round(50 * Math.max(0, Math.min(1, (38 - secs) / 30)));
    var base = 100, mult = multiplier(streak);
    if (usedHint) { base = 50; speed = Math.round(speed / 2); }
    return { base: base, speed: speed, mult: mult, total: Math.round((base + speed) * mult) };
  }
  function waitFactor(waitSecs) { return waitSecs <= 60 ? 1 : Math.max(0.3, 1 - (waitSecs - 60) / 257); }
  function hearts(acc, waitSecs) { return Math.max(1, Math.min(5, Math.round(5 * (0.75 * acc + 0.25 * waitFactor(waitSecs))))); }
  function stars(acc) { return acc >= 0.999 ? 3 : acc >= 0.75 ? 2 : acc >= 0.5 ? 1 : 0; }
  function grade(acc) { return acc >= 0.9 ? 'A' : acc >= 0.8 ? 'B' : acc >= 0.7 ? 'C' : acc >= 0.6 ? 'D' : 'F'; }

  /* Leitner mastery update after an encounter on a topic. */
  function updateMastery(save, topicId, acc, today) {
    var m = save.mastery[topicId] || { box: 0, due: today, seen: 0, correct: 0, total: 0, last: today };
    if (acc >= 0.8) m.box = Math.min(5, m.box + 1); else if (acc < 0.6) m.box = Math.max(0, m.box - 1);
    m.due = today + INTERVALS[m.box]; m.seen++; m.last = today;
    save.mastery[topicId] = m; return m;
  }
  function isDue(save, topicId, today) { var m = save.mastery[topicId]; return !!m && m.due <= today; }

  /* Pick topics for a clinic day: unlocked tiers, favour reviews due and unseen topics, no repeats. */
  function pickDay(bank, save, today, n, tier, r) {
    r = r || Math.random;
    var pool = bank.filter(function (t) { return t.tier <= tier; }), picks = [];
    var w = function (t) { var m = save.mastery[t.id]; if (!m) return 2.2; if (m.due <= today) return 3 + (5 - m.box) * 0.3; return Math.max(0.35, 1.2 - m.box * 0.17); };
    // guarantee a mix: at least 2 OB and 2 GYN when available
    while (picks.length < n && pool.length) {
      var need = null, ob = picks.filter(function (t) { return t.cat === 'OB'; }).length, gy = picks.length - ob;
      if (picks.length >= n - 2) { if (ob < 2) need = 'OB'; else if (gy < 2) need = 'GYN'; }
      var cand = need ? pool.filter(function (t) { return t.cat === need; }) : pool;
      if (!cand.length) cand = pool;
      var tot = 0; cand.forEach(function (t) { tot += w(t); }); var x = r() * tot, pick = cand[0];
      for (var i = 0; i < cand.length; i++) { x -= w(cand[i]); if (x <= 0) { pick = cand[i]; break; } }
      picks.push(pick); pool = pool.filter(function (t) { return t !== pick; });
    }
    return picks;
  }
  function pickCase(topic, save, r) {
    r = r || Math.random; var best = null, bestV = Infinity;
    topic.cases.forEach(function (c, i) { var k = topic.id + ':' + i, v = (save.caseSeen[k] || -1) + r() * 0.5; if (v < bestV) { bestV = v; best = i; } });
    return best;
  }
  function dailyPlan(bank, day) {
    var r = rng(day * 2654435761 + 12345), topics = shuffle(bank, r), obs = topics.filter(function (t) { return t.cat === 'OB'; }), gyn = topics.filter(function (t) { return t.cat === 'GYN'; });
    var picks = shuffle([obs[0], obs[1], gyn[0], gyn[1], gyn[2]], r);
    return picks.map(function (t) { return { topic: t, caseIdx: Math.floor(r() * t.cases.length) }; });
  }
  /* Build the question list for a case with shuffled options. */
  function buildQuestions(c, r) {
    r = r || Math.random;
    return c.q.map(function (q) {
      var opts = q[2].map(function (txt, i) { return { txt: txt, correct: i === 0 }; });
      return { phase: q[0], stem: q[1], opts: shuffle(opts, r), expl: q[3], answerText: q[2][0] };
    });
  }
  function addBoard(save, entry) {
    save.board.push(entry); save.board.sort(function (a, b) { return b.score - a.score; }); save.board = save.board.slice(0, 10);
    return save.board.indexOf(entry);
  }
  function award(save, id, now) { if (save.badges[id]) return false; save.badges[id] = now || Date.now(); return true; }

  var api = { LEVELS: LEVELS, BADGES: BADGES, INTERVALS: INTERVALS, rng: rng, shuffle: shuffle, newSave: newSave, levelOf: levelOf, levelProgress: levelProgress,
    maxTier: maxTier, multiplier: multiplier, scoreAnswer: scoreAnswer, hearts: hearts, waitFactor: waitFactor, stars: stars, grade: grade,
    updateMastery: updateMastery, isDue: isDue, pickDay: pickDay, pickCase: pickCase, dailyPlan: dailyPlan, buildQuestions: buildQuestions, addBoard: addBoard, award: award };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COBCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
