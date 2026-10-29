/* FEUD & DELIVERY: gameplay (board rounds, face-off, play/pass, strikes, steal, Fast Money, host override). */
(function () {
  'use strict';
  var F = window.FEUD, E = window.FeudEngine, A = window.FeudAudio, B = window.FeudBanter, ROUNDS = window.FEUD_ROUNDS;
  var $ = F.$, $$ = F.$$, esc = F.esc, sleep = F.sleep;
  var G = F.G = null;
  var MULTNAME = { 1: 'SINGLE', 2: 'DOUBLE', 3: 'TRIPLE' };

  function nm(side) { return G.names[side]; }
  function vars(side, extra) { var v = { T: esc(nm(side)), O: esc(nm(E.other(side))) }; for (var k in extra || {}) v[k] = extra[k]; return v; }
  function plain(s) { var d = document.createElement('div'); d.innerHTML = s; return d.textContent; }
  function say(cat, side, extra, face, anim) { return F.host(face || null, plain(F.line(cat, side == null ? extra : vars(side, extra))), anim); }

  /* ---------- match setup ---------- */
  F.startMatch = function (opts) {
    var picks = F.pickRounds(10, opts.cat || 'mix');
    if (picks.length < 10) picks = picks.concat(F.pickRounds(10 - picks.length, 'mix', picks.map(function (r) { return r.id; })));
    G = F.G = { opts: opts, solo: !!opts.solo, level: opts.level || 'normal', names: opts.names, boardRounds: picks.slice(0, 4), reserve: picks[4], fmRounds: picks.slice(5, 10),
      match: new E.Match({ names: opts.names }), mode: 'intro', kind: null, side: null, busy: false, timers: [], showLabels: false };
    F.debug.G = G;
    buildStage(); F.show('game'); F.party(false);
    A.theme(); F.mood('start');
    F.host('cheer', plain(F.line('welcome')), 'jump');
    sleep(2600).then(nextRound);
  };
  function clearTimers() { G.timers.forEach(clearTimeout); G.timers = []; }
  function later(fn, ms) { var t = setTimeout(fn, F.fast ? Math.min(ms, 40) : ms); G.timers.push(t); return t; }

  function buildStage() {
    var pod = function (s) {
      var rival = G.solo && s === 1;
      return '<div class="pod s' + s + '" id="pod' + s + '"><div class="who">' + (rival ? 'Simulated rival' : (G.solo ? 'Player' : (s ? 'Right · L' : 'Left · A'))) + '</div><div class="pname">' + esc(nm(s)) + (rival ? ' 🌙' : '') + '</div><div class="pscore" id="score' + s + '">0</div>' +
        '<button class="buzz" id="buzz' + s + '" data-side="' + s + '"' + (rival ? ' disabled' : '') + '>' + (rival ? 'RIVAL' : 'BUZZ') + (rival ? '' : '<small>' + (G.solo ? 'A / SPACE' : s ? 'L' : 'A') + '</small>') + '</button></div>';
    };
    var h = '<div class="stage">' +
      '<div class="qbar"><div class="qcard"><span class="cat" id="qcat">OB</span><div class="qt"><small id="qpre">Name a cause of…</small><b id="qtext">Get ready!</b></div></div><div class="bankbox" id="bankbox"><small>BANK</small><b id="bank">0</b></div></div>' +
      '<div class="boardwrap"><div class="frame"><div class="bulbs" id="bulbs"></div><div class="board" id="board"></div></div><div class="strikes" id="strikes"><i>✕</i><i>✕</i><i>✕</i></div></div>' +
      '<div class="floorrow">' + pod(0) + '<div class="hostzone"><div class="bubble"></div><img class="host" src="assets/host-happy.webp" alt="Dr. Behram, host"><div class="hostpodium">DR. BEHRAM</div></div>' + pod(1) + '</div>' +
      '<div class="dock" id="dock"></div></div>';
    $('#s-game').innerHTML = h;
    var bulbs = '', N = 44;
    for (var i = 0; i < N; i++) { var p = i / N * 4, x, y; if (p < 1) { x = p; y = 0; } else if (p < 2) { x = 1; y = p - 1; } else if (p < 3) { x = 3 - p; y = 1; } else { x = 0; y = 4 - p; } bulbs += '<i style="left:' + (x * 100).toFixed(2) + '%;top:' + (y * 100).toFixed(2) + '%"></i>'; }
    $('#bulbs').innerHTML = bulbs;
    [0, 1].forEach(function (s) { var b = $('#buzz' + s); b.addEventListener('pointerdown', function (e) { e.preventDefault(); buzz(s, true); }); });
  }
  function scores() { [0, 1].forEach(function (s) { $('#score' + s).textContent = G.match.scores[s]; }); }
  function activePod(side) { [0, 1].forEach(function (s) { var p = $('#pod' + s); p.classList.toggle('active', side === s); var t = $('.tag', p); if (t) t.remove(); }); if (side != null && G.tag) { var d = document.createElement('div'); d.className = 'tag'; d.textContent = G.tag; $('#pod' + side).appendChild(d); } }
  function armBuzzers(on) { [0, 1].forEach(function (s) { var b = $('#buzz' + s); b.classList.toggle('armed', !!on && !(G.solo && s === 1)); }); }
  function bank(v, bump) { $('#bank').textContent = v; if (bump) { var b = $('#bankbox'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } }
  function strikes(n) { $$('#strikes i').forEach(function (x, i) { x.classList.toggle('on', i < n); }); }
  function chips() { var r = G.round; $('#chip-round').textContent = G.sudden ? 'SUDDEN DEATH' : 'ROUND ' + (G.match.idx + 1) + ' / 4'; $('#chip-mult').textContent = MULTNAME[r.mult] + ' ×' + r.mult; }

  function renderBoard(r) {
    var n = r.r.a.length, rows = Math.ceil(n / 2), cells = [];
    for (var i = 0; i < rows * 2; i++) cells.push(i < n ? i : -1);
    var bd = $('#board'); bd.style.setProperty('--rows', rows); bd.style.setProperty('--n', n);
    bd.innerHTML = cells.map(function (i) {
      if (i < 0) return '<div class="tile blank"><div class="tin"><div class="tf front"></div></div></div>';
      var a = r.r.a[i];
      return '<div class="tile" data-i="' + i + '"><div class="tin"><div class="tf front"><span class="num">' + (i + 1) + '</span></div><div class="tf back"><span class="lbl">' + esc(a[0]) + '</span><span class="pts">' + a[1] + '</span></div></div></div>';
    }).join('');
    $('#qcat').textContent = r.r.cat; $('#qcat').className = 'cat ' + r.r.cat;
    $('#qtext').textContent = r.r.q; $('#qpre').textContent = 'Top differentials for…';
    bank(0); strikes(0); scores(); chips();
    var jb = $('.jokebar'); if (jb) jb.remove();
  }
  function tileEl(i) { return $('#board .tile[data-i="' + i + '"]'); }
  function flip(i, side, quiet) {
    var t = tileEl(i); if (!t) return; t.classList.add('open', side == null ? 'unclaimed' : 'by' + side, 'flash');
    if (!quiet) A.ding(i === 0); else A.flip();
  }

  /* ---------- dock (bottom control strip) ---------- */
  function dock(html) { $('#dock').innerHTML = '<div class="hostline"><img src="assets/host-' + F.face + '.webp" alt=""><span></span></div>' + html; var hl = $('#dock .hostline span'); if (hl) hl.textContent = F.lastLine || ''; }
  function dockMsg(msg, buttons, cls) {
    dock('<div class="msg ' + (cls || '') + '">' + msg + '</div>' + (buttons ? '<div class="row">' + buttons + '</div>' : ''));
  }
  function waitPrimary(label, special) {
    return new Promise(function (res) {
      dockMsg(G.dockText || '', '<button class="btn red" id="dk-go" data-nav data-primary>' + label + ' <small>SPACE</small></button>' + (special ? '<button class="btn ghost" id="dk-sp" data-nav data-special>' + special + ' <small>ENTER</small></button>' : ''));
      $('#dk-go').onclick = function () { A.click(); res('go'); };
      if (special) $('#dk-sp').onclick = function () { A.click(); res('special'); };
      G.dockText = '';
    });
  }

  /* ---------- rounds ---------- */
  function nextRound() {
    if (!G) return;
    clearTimers(); F.party(false); F.hostCalm(); activePod(null);
    if (G.match.over()) return endMatch();
    if (G.match.needsSudden()) { G.sudden = true; G.round = G.match.start(G.reserve || F.pickRounds(1, 'mix')[0]); }
    else G.round = G.match.start(G.boardRounds[G.match.idx + 1]);
    var r = G.round; renderBoard(r); F.debug.round = r;
    if (G.sudden) F.host('shock', 'SUDDEN DEATH! It\'s a tie! One face-off decides it all. Triple points!', 'doubletake');
    else F.host('happy', plain(F.line('roundIntro', { R: G.match.idx + 1 })) + (r.mult === 2 ? ' ' + F.line('multDouble') : r.mult === 3 ? ' ' + F.line('multTriple') : ''), 'jump');
    if (r.mult > 1 && !G.sudden) A.fanfare(); else A.whoosh();
    G.mode = 'intro'; G.dockText = G.sudden ? 'Sudden death face-off' : 'Round ' + (G.match.idx + 1) + ' · ' + MULTNAME[r.mult] + ' points';
    waitPrimary('Face-off!').then(armFaceoff);
  }
  function armFaceoff() {
    if (!G || G.mode === 'buzz') return;
    var r = G.round; G.mode = 'buzz'; G.kind = null; activePod(null); G.tag = null;
    F.host('happy', plain(F.line('faceoff')) + (G.solo && Math.random() < 0.5 ? ' ' + F.line('rivalTalk') : ''));
    dockMsg(G.solo ? 'Buzz in! <span class="key">A</span> / <span class="key">SPACE</span> / tap BUZZ' : 'Buzz in! <span class="key">A</span> left · <span class="key">L</span> right · tap BUZZ · gamepads', '');
    armBuzzers(true); A.whoosh();
    if (G.solo) later(function () { if (G.mode === 'buzz') buzz(1); }, E.rivalBuzzDelay(G.level));
    void r;
  }
  function buzz(side, fromTouch) {
    if (!G || G.mode !== 'buzz' || G.busy) return false;
    if (G.solo && side === 1 && fromTouch) return false;
    if (!G.round.buzz(side)) return false;
    clearTimers(); armBuzzers(false); A.buzzIn(side); G.tag = 'BUZZED IN!'; activePod(side);
    F.host('happy', nm(side) + ' buzzed in first!');
    G.mode = 'faceoff'; faceoffTurn(); return true;
  }
  F.padBuzz = function (side) { if (!G || G.mode !== 'buzz' || F.screen() !== 'game') return false; return buzz(G.solo ? 0 : side); };
  function faceoffTurn() { var side = G.round.faceoffTurn(); G.tag = 'FACE-OFF'; activePod(side); ask(side, 'faceoff'); }

  /* ---------- asking for an answer ---------- */
  function ask(side, kind) {
    G.kind = kind; G.side = side; G.mode = 'answer';
    if (G.solo && side === 1) return rivalAnswer(kind);
    var label = kind === 'steal' ? esc(nm(side)) + ': one answer to STEAL!' : kind === 'faceoff' ? esc(nm(side)) + ': your best answer!' : esc(nm(side)) + ': name another one!';
    dock('<div class="msg s' + side + '">' + label + '</div><div class="row"><input class="ansin" id="ans" data-nav autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="send" placeholder="Type a diagnosis…" aria-label="Your answer"><button class="btn red" id="say" data-nav data-special>Say it! <small>ENTER</small></button></div>');
    var inp = $('#ans');
    inp.addEventListener('input', function () { autocomplete(inp); });
    $('#say').onclick = function () { submit(inp.value); };
    setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }, 40);
    F.hostPanelRefresh();
  }
  var acIdx = -1, acList = [];
  function autocomplete(inp) {
    var q = E.normalize(inp.value), box = $('#ac'); if (box) box.remove(); acIdx = -1; acList = [];
    if (q.length < 2) return;
    var starts = [], has = [];
    F.vocab.forEach(function (v) { var n = E.normalize(v); if (n.indexOf(q) === 0 || n.indexOf(' ' + q) >= 0) starts.push(v); else if (n.indexOf(q) >= 0) has.push(v); });
    acList = starts.concat(has).slice(0, 6); if (!acList.length) return;
    var d = document.createElement('div'); d.className = 'ac'; d.id = 'ac';
    d.innerHTML = acList.map(function (v, i) { return '<div data-i="' + i + '">' + esc(v) + '</div>'; }).join('');
    $('#dock').appendChild(d);
    $$('div', d).forEach(function (el) { el.addEventListener('pointerdown', function (e) { e.preventDefault(); submit(acList[+el.getAttribute('data-i')]); }); });
  }
  function acMove(d) { if (!acList.length) return; acIdx += d; if (acIdx >= acList.length) acIdx = -1; if (acIdx < -1) acIdx = acList.length - 1; $$('#ac div').forEach(function (e, i) { e.classList.toggle('on', i === acIdx); }); }

  function submit(input) {
    if (!G || G.mode !== 'answer' || G.busy) return;
    if (typeof input === 'string' && !input.trim()) { A.click(); return; }
    G.busy = true; G.mode = 'judging';
    var box = $('#ac'); if (box) box.remove();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    judge(G.kind, input).then(function () { G.busy = false; F.hostPanelRefresh(); });
  }
  F.submit = submit;

  function rivalAnswer(kind) {
    G.mode = 'rival';
    var r = G.round, guess;
    if (Math.random() < 0.08) { var g = E.GAGS[Math.floor(Math.random() * E.GAGS.length)]; guess = { text: g.keys[0].replace(/\b\w/g, function (c) { return c.toUpperCase(); }), idx: null }; }
    else guess = E.rivalGuess(r.r, r.revealed, G.level, null, F.vocab);
    dock('<div class="msg s1">' + esc(nm(1)) + (kind === 'steal' ? ' tries to steal…' : ' is thinking…') + '</div><div class="row"><div class="typing" id="rtype"><span class="cursor"></span></div></div>');
    var t = guess.text, k = 0;
    later(function typeCh() {
      if (!G || G.mode !== 'rival') return;
      var el = $('#rtype'); if (!el) return;
      k++; el.innerHTML = esc(t.slice(0, k)) + '<span class="cursor"></span>'; if (k % 2) A.click();
      if (k < t.length) later(typeCh, 45 + Math.random() * 40);
      else later(function () { if (G && G.mode === 'rival') { G.mode = 'answer'; submit(t); } }, 500);
    }, 900 + Math.random() * 900);
  }

  /* ---------- judging an answer: survey says… ---------- */
  function shownText(input) { return typeof input === 'string' ? input : input && input.idx != null ? G.round.r.a[input.idx][0] : '(host strike)'; }
  function judge(kind, input) {
    var r = G.round, side = G.side, out;
    if (kind === 'faceoff') out = r.faceoffAnswer(input);
    else if (kind === 'play') out = r.playAnswer(input);
    else out = r.stealAnswer(input);
    F.debug.last = out;
    if (out.retry) {
      if (out.res.type === 'dupe') { A.boing(); F.host('shock', 'It\'s already on the board! I love the enthusiasm. Try another one.', 'doubletake'); }
      G.mode = 'answer'; ask(side, kind); return Promise.resolve();
    }
    var res = out.res, txt = shownText(input), hit = res.type === 'hit';
    F.host(null, '“' + txt + '”… SURVEY SAYS!');
    F.says('Survey says…');
    dockMsg('<span class="s' + side + '">' + esc(nm(side)) + '</span> said <b>“' + esc(txt) + '”</b>');
    var roll = A.drumroll(kind === 'play' ? 700 : 1100);
    return sleep(roll + 150).then(function () {
      if (hit) return reveal(res.idx, side);
      return missFx(res, kind === 'play' ? out.strikes : 1, kind);
    }).then(function () {
      if (kind === 'faceoff') return afterFaceoff(out);
      if (kind === 'play') return afterPlay(out);
      return afterSteal(out);
    });
  }
  function reveal(i, side) {
    var r = G.round, pts = r.pts(i), t = tileEl(i);
    flip(i, side); F.scorePop(t, $('#bankbox'), '+' + pts);
    later(function () { bank(r.bank, true); A.cash(); }, 500);
    var top = i === 0, low = i >= r.r.a.length - 1;
    F.host(top ? 'cheer' : 'happy', plain(F.line(top ? 'topAnswer' : low ? 'lowAnswer' : 'goodAnswer', vars(side))), top ? 'dance' : 'jump');
    if (top) { F.mood('big'); var b = t.getBoundingClientRect(); F.confetti(140, b.left + b.width / 2, b.top + b.height / 2, 0.9); A.cheer(); }
    else if (!low) A.applause(1.2, 0.5);
    return sleep(top ? 1700 : 1300).then(function () { F.hostCalm(); });
  }
  function missFx(res, n, kind) {
    var strike = kind === 'play';
    if (res.type === 'gag') {
      A.gag(res.gag.fx); F.nope();
      F.host('shock', res.gag.say, 'doubletake'); F.mood('stall');
      if (Math.random() < 0.6) later(function () { F.cameo(); }, 900);
      return sleep(2300).then(function () { if (strike || kind === 'faceoff') { A.strike(n === 3); return F.bigX(strike ? n : 1, strike && n === 3); } });
    }
    var slow = strike && n === 3;
    A.strike(slow); if (strike) strikes(n);
    if (slow) { F.host('wince', plain(F.line('strike3')), 'slump'); F.mood('hit'); later(function () { A.sadTrombone(); }, 1500); }
    else if (strike) F.host(n === 2 ? 'wince' : 'shock', plain(F.line(n === 2 ? 'strike2' : 'strike1')), 'doubletake');
    else F.host('wince', plain(F.line('wrong')), 'wobble');
    if (!slow && Math.random() < 0.3) later(function () { A.sadTrombone(); }, 700);
    if (!slow && Math.random() < 0.22) later(function () { F.cameo(); }, 1000);
    return F.bigX(strike ? n : 1, slow).then(function () { return sleep(slow ? 300 : 200); });
  }
  function afterFaceoff(out) {
    var r = G.round;
    if (out.done) return endRound();
    if (G.sudden && out.decided != null) return endSudden();
    if (out.decided != null) return playPass(out.decided);
    if (out.again) { F.host('shock', 'Nobody found it! Back to the buzzers!', 'doubletake'); G.mode = 'x'; return sleep(1400).then(armFaceoff); }
    void r; faceoffTurn();
  }
  function playPass(side) {
    G.tag = 'WON FACE-OFF'; activePod(side); A.fanfare();
    F.host('cheer', plain(F.line('playPass', vars(side))), 'jump');
    if (G.solo && side === 1) { dockMsg(esc(nm(1)) + ' won the face-off… and decides to PLAY.'); return sleep(1600).then(function () { choose(true); }); }
    G.mode = 'playpass';
    G.dockText = '<span class="s' + side + '">' + esc(nm(side)) + '</span>: play or pass?';
    waitPrimary('PLAY', 'PASS').then(function (w) { choose(w === 'go'); });
  }
  function choose(play) {
    if (!G || G.round.phase !== 'playOrPass') return;
    var c = G.round.choose(play);
    F.host('happy', plain(F.line(play ? 'play' : 'pass', vars(play ? c : E.other(c)))), play ? 'jump' : 'wobble');
    A.whoosh(); G.tag = 'IN CONTROL'; activePod(c); strikes(0);
    later(function () { ask(c, 'play'); }, 1200);
  }
  function afterPlay(out) {
    if (out.done) { F.host('cheer', plain(F.line('clear', vars(G.round.control))), 'dance'); F.cannons(); A.fanfare(); F.mood('big'); return sleep(1800).then(endRound); }
    if (out.toSteal != null) return stealPhase(out.toSteal);
    ask(G.round.control, 'play');
  }
  function stealPhase(thief) {
    G.tag = 'STEAL!'; activePod(thief); A.steal();
    F.host('shock', plain(F.line('stealSetup', vars(G.round.control))), 'doubletake');
    return sleep(1900).then(function () { ask(thief, 'steal'); });
  }
  function afterSteal(out) {
    var thief = E.other(G.round.control);
    if (out.stolen) { F.host('cheer', plain(F.line('stealWin', vars(thief))), 'dance'); A.cheer(); F.confetti(180); F.mood('big'); }
    else { F.host('wince', plain(F.line('stealFail', vars(thief))), 'wobble'); A.sadTrombone(); }
    return sleep(1800).then(endRound);
  }

  /* ---------- end of a round ---------- */
  function endRound() {
    var r = G.round, res = G.match.commit(); G.mode = 'end'; G.kind = null; F.hostPanelRefresh();
    return bankToPod(res).then(function () { return revealRest(); }).then(function () { return roundWrap(res); });
  }
  function endSudden() {
    var res = G.match.commitSudden(); G.mode = 'end'; G.kind = null;
    F.host('cheer', nm(res.winner) + ' wins the sudden-death face-off!', 'dance');
    return bankToPod(res).then(revealRest).then(function () { return roundWrap(res); });
  }
  function bankToPod(res) {
    var r = G.round, w = res.winner; G.tag = 'WINS THE ROUND'; activePod(w);
    if (r.mult > 1) F.toast('Bank ' + r.bank + ' × ' + r.mult + ' = <b>' + res.pts + '</b>', '✖️');
    F.scorePop($('#bankbox'), $('#score' + w), '+' + res.pts);
    F.host('cheer', plain(F.line('roundWin', vars(w, { P: res.pts }))), 'jump');
    A.applause(2.2, Math.min(1, 0.4 + res.pts / 200));
    return sleep(700).then(function () {
      A.cash(); scores(); bank(0, true);
      var p = $('#score' + w); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump');
      var b = $('#pod' + w).getBoundingClientRect(); F.confetti(90, b.left + b.width / 2, b.top, 0.8);
      return sleep(1300);
    });
  }
  function revealRest() {
    var r = G.round, left = [];
    r.revealed.forEach(function (v, i) { if (!v) left.push(i); });
    if (!left.length) return Promise.resolve();
    F.host('happy', 'Let\'s see what\'s left on the board…');
    return left.reduce(function (p, i) { return p.then(function () { flip(i, null, true); return sleep(500); }); }, sleep(500));
  }
  function roundWrap(res) {
    var r = G.round;
    if (Math.random() < 0.35 || F.forceJoke) {
      var jb = document.createElement('div'); jb.className = 'jokebar';
      G.joke = F.line('bonus'); jb.innerHTML = '<b>BONUS JOKE TILE</b> <small>not a real answer · 0 pts</small> ' + esc(G.joke);
      $('.boardwrap').appendChild(jb); A.slideWhistle();
    } else G.joke = null;
    G.dockText = 'Round over · ' + esc(nm(res.winner)) + ' +' + res.pts;
    return waitPrimary('Teaching pearls').then(function () { pearls(r); });
  }
  function pearls(r) {
    var h = '<div class="pearls card"><div class="t-pre" style="text-align:center">' + r.r.cat + ' · ROUND REVIEW</div><h2>Teaching pearls</h2><div class="pq">' + esc(r.r.q) + '</div>' +
      r.r.a.map(function (a, i) {
        return '<div class="pearl"><span class="n">' + (i + 1) + '</span><span class="l">' + esc(a[0]) + '</span><span class="p">' + a[1] + '</span><div class="t">' + esc(a[3]) + '</div></div>';
      }).join('') +
      (G.joke ? '<div class="pearl joke"><span class="n">★</span><span class="l">BONUS JOKE TILE: not a real answer</span><span class="p">0</span><div class="t">' + esc(G.joke) + '</div></div>' : '') +
      '<div class="basis"><b>How these were ranked:</b> ' + esc(r.r.basis) + (r.r.ties ? ' <b>Honest ties:</b> ' + esc(r.r.ties) : '') +
      '<br><small>Points show approximate relative likelihood for teaching, not exact epidemiology. Not clinical guidance.</small></div>' +
      '<div class="btnrow"><button class="btn gold" id="pl-next" data-nav data-primary data-autofocus>' + (G.match.over() || G.match.needsSudden() || G.sudden ? 'Continue' : 'Next round') + ' <small>SPACE</small></button></div></div>';
    $('#s-pearls').innerHTML = h; F.show('pearls'); $('#s-pearls').scrollTop = 0;
    $('#pl-next').onclick = function () { A.click(); F.show('game'); nextRound(); };
  }

  /* ---------- end of the match ---------- */
  function endMatch() {
    var w = G.match.leader(); G.mode = 'over'; activePod(w); chipsDone(); dockMsg('And the winner is…');
    if (G.solo && w === 1) {
      F.host('wince', plain(F.line('soloLose')), 'slump'); A.sadTrombone(); F.mood('lose');
      later(function () { F.cameo('I came in for a checkup and stayed for the game show. Rematch?'); }, 1200);
      return sleep(2400).then(function () { results({ big: 'Night Float wins!', sub: 'Final score ' + G.match.scores[0] + ' to ' + G.match.scores[1] + '. The rival never sleeps… but you can still try Fast Money.', face: 'wince', fm: true }); });
    }
    F.party(true); F.cannons(); A.win(); F.mood('win');
    F.host('cheer', plain(F.line('matchWin', vars(w))), 'dance');
    G.dockText = '<b>' + esc(nm(w)) + '</b> wins ' + G.match.scores[w] + ' to ' + G.match.scores[E.other(w)] + '!';
    return sleep(1200).then(function () { return waitPrimary('FAST MONEY!', 'Skip'); }).then(function (c) {
      F.party(false);
      if (c === 'go') startFM({ team: nm(w), seats: G.solo ? [nm(0) + ' · turn 1', nm(0) + ' · turn 2'] : [nm(w) + ' · player 1', nm(w) + ' · player 2'], prompts: G.fmRounds });
      else results({ big: nm(w) + ' wins!', sub: 'Final score ' + G.match.scores[0] + ' to ' + G.match.scores[1] + '.', face: 'cheer' });
    });
  }
  function chipsDone() { $('#chip-round').textContent = 'FINAL'; }

  function results(o) {
    clearTimers(); F.party(!!o.party);
    var sc = G && G.match ? '<div class="scores2">' + [0, 1].map(function (s) { return '<div class="pod s' + s + '"><div class="pname">' + esc(nm(s)) + '</div><div class="pscore">' + G.match.scores[s] + '</div></div>'; }).join('') + '</div>' : '';
    $('#s-results').innerHTML = '<div class="results card"><img class="res-host host" src="assets/host-' + (o.face || 'happy') + '.webp" alt="Dr. Behram"><div class="big">' + esc(o.big) + '</div>' + sc + '<p>' + esc(o.sub || '') + '</p>' +
      '<div class="btnrow"><button class="btn gold" id="r-again" data-nav data-primary data-autofocus>Play again <small>SPACE</small></button>' +
      (o.fm ? '<button class="btn teal" id="r-fm" data-nav>Fast Money</button>' : '') +
      '<button class="btn ghost" id="r-title" data-nav data-special data-back>Title <small>ENTER</small></button></div></div>';
    F.show('results');
    var opts = G && G.opts;
    $('#r-again').onclick = function () { A.click(); if (opts && opts.names) F.startMatch(opts); else F.practiceFM(); };
    $('#r-title').onclick = function () { A.click(); quit(); };
    if (o.fm) $('#r-fm').onclick = function () { A.click(); startFM({ team: nm(0), seats: [nm(0) + ' · turn 1', nm(0) + ' · turn 2'], prompts: G.fmRounds }); };
  }
  function quit() { if (G) { clearTimers(); if (G.fmState) clearInterval(G.fmState.tick); G.mode = 'quit'; } A.stopAll && A.stopAll(); F.party(false); F.hostPanel(false); F.title(); }
  F.quit = quit;

  /* ---------- FAST MONEY ---------- */
  F.practiceFM = function () {
    G = F.G = { opts: { practice: true }, solo: true, names: ['Player 1', 'Player 2'], timers: [], showLabels: false, match: null };
    F.debug.G = G;
    startFM({ team: 'Practice', seats: ['Player 1', 'Player 2'], prompts: F.pickRounds(5, F.cfg.cat || 'mix') });
  };
  function startFM(o) {
    clearTimers(); $('#s-game').innerHTML = '';
    var fm = new E.FastMoney(o.prompts, { target: 200, times: [20, 25] });
    var S = G.fmState = { fm: fm, seat: 0, i: 0, time: 0, tick: null, running: false, seats: o.seats, team: o.team };
    F.debug.fm = fm;
    var rows = o.prompts.map(function (p, i) {
      return '<div class="fmrow" id="fr' + i + '"><div class="cond">' + (i + 1) + '. ' + esc(p.q) + '</div><div class="a a1"></div><div class="s s1"></div><div class="a a2"></div><div class="s s2"></div></div>';
    }).join('');
    $('#s-fm').innerHTML = '<div class="fm"><div class="fmboard"><div class="fmhead"><span>Fast Money</span><span id="fm-who">' + esc(o.team) + '</span></div>' + rows + '</div>' +
      '<div class="fmside"><div class="clock" id="clock"><small>TIME</small><b id="clk">20</b></div><div class="total"><small>TOTAL · 200 TO WIN</small><b id="fmtotal">0</b></div>' +
      '<div class="hostzone"><div class="bubble"></div><img class="host" src="assets/host-happy.webp" alt="Dr. Behram, host"></div></div></div><div class="dock" id="dock"></div>';
    $('#chip-round').textContent = 'FAST MONEY'; $('#chip-mult').textContent = 'TARGET 200';
    F.show('fm'); A.fanfare(); F.mood('start');
    F.host('cheer', plain(F.line('fmIntro')), 'jump');
    G.mode = 'fm'; seatIntro(0);
  }
  function seatIntro(seat) {
    var S = G.fmState; S.seat = seat; S.i = -1;
    $$('.fmrow').forEach(function (r) { r.classList.toggle('seat2', seat === 1); });
    $('#fm-who').textContent = S.seats[seat];
    $('#clk').textContent = S.fm.times[seat]; $('#clock').classList.remove('urgent');
    if (seat === 1) { $$('.fmrow .a1').forEach(function (a) { a.classList.add('hide'); }); F.host('happy', plain(F.line('fmSeat2', { P: Math.max(0, 200 - S.fm.seatTotal(0)) })), 'jump'); }
    G.dockText = '<b>' + esc(S.seats[seat]) + '</b>: ' + S.fm.times[seat] + ' seconds for 5 conditions. ' + (seat ? 'Repeat your partner\'s answer and you\'ll hear the buzzer!' : 'Pass to come back later.');
    waitPrimary('Start the clock!').then(function () { runSeat(seat); });
  }
  function runSeat(seat) {
    var S = G.fmState; S.time = S.fm.times[seat]; S.running = true; S.i = -1; G.fmMode = 'answer';
    S.tick = setInterval(function () {
      S.time--; $('#clk').textContent = Math.max(0, S.time);
      A.tick(S.time <= 5); $('#clock').classList.toggle('urgent', S.time <= 5);
      if (S.time <= 0) endSeat(seat);
    }, F.fast ? 120 : 1000);
    nextCond();
  }
  function nextCond() {
    var S = G.fmState, open = S.fm.open(S.seat);
    if (!open.length) return endSeat(S.seat);
    var nx = open.filter(function (i) { return i > S.i; })[0]; if (nx == null) nx = open[0];
    S.i = nx;
    $$('.fmrow').forEach(function (r, k) { r.classList.toggle('cur', k === nx); });
    var p = S.fm.prompts[nx];
    dock('<div class="msg">' + (nx + 1) + '. ' + esc(p.q) + '</div><div class="row"><input class="ansin" id="ans" data-nav autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="send" placeholder="Fast! Type a diagnosis…" aria-label="Fast Money answer">' +
      '<button class="btn red" id="say" data-nav data-special>Say it <small>ENTER</small></button><button class="btn ghost" id="fpass" data-nav>Pass <small>TAB</small></button></div>');
    var inp = $('#ans'); inp.addEventListener('input', function () { autocomplete(inp); });
    $('#say').onclick = function () { fmSubmit(inp.value); };
    $('#fpass').onclick = function () { fmPass(); };
    setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }, 30);
    F.hostPanelRefresh();
  }
  function fmSubmit(input) {
    var S = G.fmState; if (!S || !S.running) return;
    if (input && typeof input === 'object') { if (input.strike) input = 'pass'; else input = S.fm.prompts[S.i].a[input.idx][0]; }
    if (!String(input).trim()) { A.click(); return; }
    var box = $('#ac'); if (box) box.remove();
    var rec = S.fm.submit(S.seat, S.i, String(input).trim());
    if (rec.type === 'dupe') { A.buzzIn(1); A.strike(false); F.host('shock', 'DUPLICATE! Your partner said that. Try again, quickly!', 'doubletake'); $('#ans').value = ''; return; }
    var cell = $('#fr' + S.i + ' .a' + (S.seat + 1)); cell.textContent = String(input).trim();
    A.pop(); nextCond();
  }
  function fmPass() { var S = G.fmState; if (!S || !S.running) return; S.fm.pass(S.seat, S.i); $('#fr' + S.i + ' .a' + (S.seat + 1)).textContent = '(pass)'; A.whoosh(); nextCond(); }
  F.fmSubmit = fmSubmit; F.fmPass = fmPass;
  function endSeat(seat) {
    var S = G.fmState; if (!S.running) return; S.running = false; clearInterval(S.tick); G.fmMode = 'reveal';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    A.horn(); $$('.fmrow').forEach(function (r) { r.classList.remove('cur'); });
    F.host('happy', S.time <= 0 ? 'TIME! Let\'s see how you did…' : 'All five! Let\'s see how you did…', 'jump');
    dockMsg('Revealing ' + esc(S.seats[seat]) + '…');
    var run = sleep(1300);
    S.fm.prompts.forEach(function (p, i) {
      run = run.then(function () {
        var a = S.fm.ans[seat][i], row = $('#fr' + i), cell = $('.a' + (seat + 1), row), sc = $('.s' + (seat + 1), row);
        $$('.fmrow').forEach(function (r, k) { r.classList.toggle('cur', k === i); });
        if (!a || a.type === 'pass') { cell.textContent = a ? '(pass)' : '(no answer)'; sc.textContent = '0'; sc.classList.add('zero'); A.nope(); return sleep(500); }
        F.host(null, '“' + a.text + '”… survey says!');
        return sleep(A.drumroll(550) + 80).then(function () {
          sc.textContent = a.pts; sc.classList.toggle('zero', !a.pts);
          if (a.pts) { A.ding(a.idx === 0); F.scorePop(sc, $('#fmtotal'), '+' + a.pts); if (a.idx === 0) F.host('cheer', 'Number one answer! ' + a.label + '!', 'jump'); else F.host('happy', a.label + '!'); }
          else if (a.gag) { A.gag(a.gag.fx); F.host('shock', a.gag.say, 'doubletake'); }
          else { A.nope(); F.host('wince', 'Not on the board!', 'wobble'); }
          return sleep(500).then(function () { $('#fmtotal').textContent = S.fm.seatTotal(0) + (seat ? S.fm.seatTotal(1) : 0); return sleep(450); });
        });
      });
    });
    run.then(function () {
      $$('.fmrow').forEach(function (r) { r.classList.remove('cur'); });
      if (S.fm.won()) return fmEnd(true);
      if (seat === 0) return seatIntro(1);
      fmEnd(false);
    });
  }
  function fmEnd(won) {
    var S = G.fmState, tot = S.fm.total(); G.fmMode = 'over'; $('#fmtotal').textContent = tot;
    if (won) { F.party(true); F.cannons(); A.win(); A.cheer(); F.mood('win'); F.host('cheer', plain(F.line('fmWin')), 'dance'); }
    else { A.lose(); A.sadTrombone(); F.mood('lose'); F.host('wince', plain(F.line('fmLose')), 'slump'); }
    G.dockText = 'Fast Money total: <b>' + tot + '</b>' + (won ? ' WIN!' : ' (needed 200)');
    sleep(won ? 2600 : 1800).then(function () { return waitPrimary('Results'); }).then(function () {
      results({ big: won ? 'FAST MONEY WIN!' : 'So close: ' + tot, sub: won ? S.team + ' scored ' + tot + ' in Fast Money!' : S.team + ' scored ' + tot + ' of 200. Every one of those was a real differential.', face: won ? 'cheer' : 'happy', party: won });
    });
  }

  /* ---------- HOST OVERRIDE panel (H key, ⚙ button, gamepad Start) ---------- */
  var panelOpen = false;
  F.hostPanel = function (force, byKey) {
    var hp = $('#hostpanel'); if (!hp) return;
    panelOpen = force == null ? !panelOpen : !!force;
    if (panelOpen && !(F.screen() === 'game' || F.screen() === 'fm')) panelOpen = false;
    hp.classList.toggle('hidden', !panelOpen); F.hostFocus = panelOpen && !!byKey;
    if (panelOpen) { A.click(); renderPanel(); }
  };
  F.hostPanelRefresh = function () { if (panelOpen) renderPanel(); };
  function renderPanel() {
    var hp = $('#hostpanel'), fmS = F.screen() === 'fm' && G && G.fmState, slots, can, h;
    if (fmS) { var p = fmS.fm.prompts[Math.max(0, fmS.i)]; slots = p.a; can = fmS.running; }
    else if (G && G.round) { slots = G.round.r.a; can = G.mode === 'answer' && !(G.solo && G.side === 1); }
    else { slots = []; can = false; }
    h = '<h3>Host override</h3><p>' + (can ? 'Tap the answer the player meant (judge\'s call), or give a strike.' : 'Judge buttons light up while a player is answering.') + ' Labels are hidden so the projector won\'t spoil the board.</p>' +
      slots.map(function (a, i) {
        var done = !fmS && G.round.revealed[i];
        return '<button class="slot" data-nav data-i="' + i + '"' + (!can || done ? ' disabled' : '') + '><b>#' + (i + 1) + '</b><span>' + (G.showLabels || done ? esc(a[0]) : '••••••') + '</span><i>' + a[1] + '</i></button>';
      }).join('') +
      '<div class="hp-row">' + (fmS ? '<button class="btn red" id="hp-x" data-nav' + (can ? '' : ' disabled') + '>Pass</button><button class="btn ghost" id="hp-stop" data-nav' + (can ? '' : ' disabled') + '>Stop clock</button>'
        : '<button class="btn red" id="hp-x" data-nav' + (can ? '' : ' disabled') + '>✕ Strike / wrong</button><button class="btn teal" id="hp-all" data-nav' + (G && G.round && G.round.phase !== 'done' && G.mode !== 'end' && G.mode !== 'judging' ? '' : ' disabled') + '>Reveal all · end round</button>') +
      '</div><div class="hp-row"><button class="btn ghost" id="hp-eye" data-nav>' + (G && G.showLabels ? '🙈 Hide labels' : '👁 Show labels') + '</button><button class="btn ghost" id="hp-quit" data-nav>Quit to title</button><button class="btn gold" id="hp-close" data-nav data-back>Close</button></div>';
    hp.innerHTML = h;
    $$('.slot', hp).forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-i'); F.hostPanel(false); if (fmS) fmSubmit({ idx: i }); else submit({ idx: i }); }; });
    var x = $('#hp-x'); if (x) x.onclick = function () { F.hostPanel(false); if (fmS) fmPass(); else submit({ strike: true }); };
    var st = $('#hp-stop'); if (st) st.onclick = function () { F.hostPanel(false); endSeat(fmS.seat); };
    var all = $('#hp-all'); if (all) all.onclick = function () { F.hostPanel(false); forceEnd(); };
    $('#hp-eye').onclick = function () { if (G) G.showLabels = !G.showLabels; renderPanel(); };
    $('#hp-quit').onclick = function () { F.hostPanel(false); quit(); };
    $('#hp-close').onclick = function () { F.hostPanel(false); };
  }
  function forceEnd() {
    var r = G.round; if (!r || r.phase === 'done' || G.busy) return;
    clearTimers(); armBuzzers(false);
    var side = r.control != null ? r.control : r.fo.winner != null ? r.fo.winner : r.fo.first != null ? r.fo.first : 0;
    r._finish(side); F.host('happy', 'Host\'s call: let\'s reveal the board!'); endRound();
  }

  /* ---------- keys ---------- */
  function answerKeys(k, typing, onEnter, onTab) {
    if (k === 'Enter') { var v = acIdx >= 0 ? acList[acIdx] : ($('#ans') ? $('#ans').value : ''); onEnter(v); return true; }
    if (k === 'ArrowDown') { acMove(1); return true; }
    if (k === 'ArrowUp') { acMove(-1); return true; }
    if (k === 'Tab') { onTab(); return true; }
    if (k === 'Escape') { document.activeElement.blur(); return true; }
    return false;
  }
  F.keys.game = function (k, e, typing) {
    if (!G) return false;
    if (G.mode === 'buzz' && !typing) {
      if (k === 'a' || k === 'A' || (G.solo && k === ' ')) { buzz(0, true); return true; }
      if (!G.solo && (k === 'l' || k === 'L')) { buzz(1, true); return true; }
    }
    if (typing && G.mode === 'answer') return answerKeys(k, typing, submit, function () { var inp = $('#ans'); if (acList.length && inp) { inp.value = acList[Math.max(0, acIdx)]; autocomplete(inp); } });
    if (!typing && (k === 'h' || k === 'H')) { F.hostPanel(null, true); return true; }
    if (!typing && G.mode === 'answer' && !panelOpen && (k === ' ' || k === 'Enter') && $('#ans')) { $('#ans').focus(); return true; }
    return false;
  };
  F.keys.fm = function (k, e, typing) {
    if (!G || !G.fmState) return false;
    var S = G.fmState;
    if (typing && S.running) return answerKeys(k, typing, fmSubmit, fmPass);
    if (!typing && (k === 'h' || k === 'H')) { F.hostPanel(null, true); return true; }
    if (!typing && S.running && !panelOpen && (k === ' ' || k === 'Enter') && $('#ans')) { $('#ans').focus(); return true; }
    return false;
  };

  /* ---------- test/debug hooks (read-only state) ---------- */
  F.debug.state = function () {
    if (!G) return null;
    var r = G.round, S = G.fmState;
    return { mode: G.mode, kind: G.kind, side: G.side, busy: G.busy, sudden: !!G.sudden, phase: r && r.phase, strikes: r && r.strikes, bank: r && r.bank, control: r && r.control,
      roundIdx: G.match && G.match.idx, scores: G.match && G.match.scores.slice(), history: G.match && G.match.history.slice(), stealResult: r && r.stealResult,
      fm: S ? { seat: S.seat, i: S.i, running: S.running, total: S.fm.total(), mode: G.fmMode } : null, screen: F.screen() };
  };

  F.boot();
})();
