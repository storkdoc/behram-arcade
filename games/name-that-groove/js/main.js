/* NAME THAT GROOVE: game flow, input (mouse / touch / keyboard / gamepad), screens. */
(function () {
  'use strict';
  const C = window.NTG_Catalog, Q = window.NTG_Quiz, A = window.NTG_Arrange;
  const $ = id => document.getElementById(id);
  const MS = window.MoodSticker || { event() { }, screen() { }, bindPause() { } };
  const audio = new window.NTG_Audio(), viz = new window.NTG_Viz($('viz'));
  const params = new URLSearchParams(location.search);
  const GRACE = 6;           // seconds to answer after the clip ends
  const store = (() => { try { localStorage.setItem('ntg.t', '1'); localStorage.removeItem('ntg.t'); return localStorage; } catch (e) { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; } })();
  const S = {
    screen: 'title', decade: store.getItem('ntg.decade') || 'all', diff: store.getItem('ntg.diff') || 'normal',
    round: null, qi: 0, phase: 'idle', t: 0, clipT0: 0, clipLen: 12, score: 0, streak: 0, bestStreak: 0, right: 0, hinted: false, removed: [], log: [], paused: false, hl: null, crateDec: '70s', preview: null
  };
  if (!C.DECADE_INFO[S.decade]) S.decade = 'all'; if (!Q.DIFFS[S.diff]) S.diff = 'normal';
  const noAudio = !audio.supported();
  if (noAudio) $('audioNote').hidden = false;

  // ---------------- screens ----------------
  function show(name) {
    if (S.preview) stopPreview();
    S.screen = name; document.body.dataset.screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === 's-' + name));
    if (name !== 'play') { document.body.dataset.theme = name === 'title' ? S.decade : document.body.dataset.theme; }
    setHL(null);
    if (name === 'title') { refreshTitle(); setHL($('btnStart'), true); }
    if (name === 'howto' || name === 'scores') setHL(document.querySelector('#s-' + name + ' .big'), true);
    if (name === 'crate') buildCrate();
    if (name === 'scores') buildScores();
    if (name === 'results') setHL($('btnAgain'), true);
    MS.screen(name === 'play' ? 'play' : name);
    document.querySelector('#s-' + name).scrollTop = 0;
  }
  function refreshTitle() {
    document.querySelectorAll('[data-decade]').forEach(b => { b.classList.toggle('on', b.dataset.decade === S.decade); b.setAttribute('aria-pressed', b.dataset.decade === S.decade); });
    document.querySelectorAll('[data-diff]').forEach(b => { b.classList.toggle('on', b.dataset.diff === S.diff); b.setAttribute('aria-pressed', b.dataset.diff === S.diff); });
    $('diffBlurb').textContent = Q.DIFFS[S.diff].blurb + ' ' + C.DECADE_INFO[S.decade].blurb;
    const best = Q.loadBest(store, S.decade, S.diff)[0];
    $('bestLine').textContent = best ? `BEST ${C.DECADE_INFO[S.decade].label} · ${Q.DIFFS[S.diff].label}: ${best.score.toLocaleString()} (${best.right}/10)` : '';
    document.body.dataset.theme = S.decade;
  }

  // ---------------- round flow ----------------
  function startRound() {
    audio.unlock();
    const seed = params.has('seed') ? (+params.get('seed') >>> 0) : undefined;
    S.round = Q.makeRound({ mode: S.decade, diff: S.diff, seed });
    S.qi = -1; S.score = 0; S.streak = 0; S.bestStreak = 0; S.right = 0; S.log = [];
    show('play'); audio.sting('start', S.decade === 'all' ? null : S.decade);
    setTimeout(nextQuestion, noAudio || !audio.ok ? 0 : 450);
    S.phase = 'wait';
  }
  function curSong() { return C.byId(S.round.questions[S.qi].answer); }
  function nextQuestion() {
    if (S.screen !== 'play') return;
    S.qi++;
    if (S.qi >= S.round.questions.length) return finishRound();
    const q = S.round.questions[S.qi], song = curSong();
    S.phase = 'listen'; S.hinted = false; S.removed = []; S.t = 0;
    document.body.dataset.theme = q.decade; viz.setTheme(q.decade);
    $('hQ').textContent = `${q.n}/${S.round.questions.length}`; $('hDec').textContent = C.DECADE_INFO[q.decade].label;
    $('hScore').textContent = S.score.toLocaleString(); $('hStreak').textContent = S.streak;
    const box = $('choices'); box.innerHTML = '';
    const tags = Q.DIFFS[S.diff].tags;
    q.choices.forEach((id, i) => {
      const s = C.byId(id), b = document.createElement('button');
      b.className = 'ch'; b.dataset.nav = ''; b.dataset.i = i; b.setAttribute('aria-label', `${i + 1}: ${s.title}`);
      b.innerHTML = `<span class="n">${i + 1}</span><span><span class="t"></span>${tags ? '<span class="tag"></span>' : ''}</span>`;
      b.querySelector('.t').textContent = s.title; if (tags) b.querySelector('.tag').textContent = s.tag;
      b.addEventListener('click', () => answer(i));
      box.appendChild(b);
    });
    $('actions').hidden = false; $('reveal').hidden = true;
    $('btn5050').disabled = false; $('btnReplay').disabled = true;
    $('flash').className = ''; $('flash').textContent = '';
    setHL(null);
    startClip(song, 0);
  }
  function startClip(song) {
    const arr = A.arrange(song);
    S.arr = arr; S.clipLen = arr.length; S.clipT0 = S.t;
    if (audio.ok) audio.playArrangement(arr);
  }
  function clipPos() { return S.t - S.clipT0; }
  function potential() { return Q.scoreAnswer({ correct: true, elapsed: S.t, clipLen: S.clipLen, streak: S.streak, hinted: S.hinted && !noAudioMode() }); }
  function noAudioMode() { return noAudio || !audio.ok; }

  function answer(i, timedOut) {
    if (S.screen !== 'play' || S.phase !== 'listen' || S.paused) return;
    if (!timedOut && S.removed.includes(i)) return;
    const q = S.round.questions[S.qi], song = curSong();
    const correct = !timedOut && i === q.correct;
    const res = Q.scoreAnswer({ correct, elapsed: S.t, clipLen: S.clipLen, streak: S.streak, hinted: S.hinted && !noAudioMode() });
    S.phase = 'reveal'; S.score += res.total; S.streak = res.streak; S.bestStreak = Math.max(S.bestStreak, S.streak); if (correct) S.right++;
    S.log.push({ id: song.id, correct, picked: timedOut ? -1 : q.choices[i], pts: res.total, time: +S.t.toFixed(2) });
    document.querySelectorAll('.ch').forEach((b, k) => { b.disabled = true; if (k === q.correct) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); });
    const fl = $('flash'); fl.textContent = correct ? (S.streak >= 5 ? 'ON FIRE!' : S.streak >= 3 ? `${S.streak} IN A ROW!` : S.t < S.clipLen * 0.35 ? 'NAILED IT!' : 'RIGHT ON!') : timedOut ? "TIME'S UP" : 'NOPE!';
    fl.style.color = correct ? '#45ff9a' : '#ff4d6d'; fl.className = ''; void fl.offsetWidth; fl.className = 'show';
    $('rvMark').textContent = correct ? '✓' : '✗'; $('rvMark').style.color = correct ? '#45ff9a' : '#ff4d6d';
    $('rvTitle').textContent = song.title;
    $('rvSub').textContent = `${song.artist} · ${C.DECADE_INFO[song.decade].label} ${song.tag} · original track, fictional artist`;
    $('rvPts').textContent = correct ? `+${res.total}` : '+0';
    $('rvPts').title = correct ? `100 base + ${res.speed} speed${S.hinted && !noAudioMode() ? ', halved for 50:50' : ''}, ×${res.mult} streak` : '';
    $('actions').hidden = true; $('reveal').hidden = false;
    $('hScore').textContent = S.score.toLocaleString(); $('hStreak').textContent = S.streak;
    setHL($('btnNext'), true);
    // musical feedback, then the hook of the right answer so you learn it
    if (audio.ok) {
      audio.stopClip(0.12); audio.sting(correct ? 'right' : 'wrong', song.decade);
      const token = S.qi; setTimeout(() => { if (S.screen === 'play' && S.phase === 'reveal' && S.qi === token) audio.playArrangement(A.arrange(song, { fromBar: 3, bars: 2 }), { fadeOut: true }); }, correct ? 520 : 760);
    }
    if (correct) { MS.event(S.streak >= 3 || res.speed > 100 ? 'big' : 'start'); } else MS.event('hit');
  }

  function useHint() {
    if (S.phase !== 'listen' || S.hinted || S.paused) return;
    const q = S.round.questions[S.qi];
    S.hinted = true; S.removed = Q.fiftyFifty(q, S.round.seed);
    document.querySelectorAll('.ch').forEach((b, k) => { if (S.removed.includes(k)) { b.classList.add('gone'); b.disabled = true; } });
    if (S.hl && S.hl.disabled) setHL(null);
    $('btn5050').disabled = true; audio.sting('move');
  }
  function replay() {
    if (S.phase !== 'listen' || S.paused || clipPos() < S.clipLen) return;
    startClip(curSong()); $('btnReplay').disabled = true;
  }

  function finishRound() {
    S.phase = 'done'; audio.stopClip(0.3);
    const n = S.round.questions.length, acc = S.right / n;
    const entry = { score: S.score, right: S.right, streak: S.bestStreak, date: new Date().toISOString().slice(0, 10) };
    const prevBest = (Q.loadBest(store, S.decade, S.diff)[0] || { score: -1 }).score;
    Q.saveBest(store, S.decade, S.diff, entry);
    const isNew = S.score > prevBest && S.score > 0;
    $('resRank').textContent = Q.rankFor(S.score, acc);
    $('resScore').textContent = S.score.toLocaleString();
    $('resLine').textContent = `${S.right}/${n} named · best streak ${S.bestStreak} · ${C.DECADE_INFO[S.decade].label} · ${Q.DIFFS[S.diff].label}`;
    $('resNew').hidden = !isNew;
    const list = $('resList'); list.innerHTML = '';
    S.log.forEach(L => list.appendChild(recButton(C.byId(L.id), L.correct ? '✓' : '✗', L.correct ? '#45ff9a' : '#ff4d6d')));
    document.body.dataset.theme = S.decade;
    show('results');
    if (audio.ok) audio.sting(acc >= 0.7 ? 'fanfare' : acc >= 0.4 ? 'right' : 'wrong', S.decade === 'all' ? null : S.decade);
    MS.event(isNew || acc >= 0.8 ? 'win' : acc < 0.4 ? 'lose' : 'big');
  }

  // ---------------- record crate / previews ----------------
  const LABEL = { '70s': '#ff8a00', '80s': '#ff3cac', '90s': '#00e5c7' };
  function recButton(song, mark, markColor) {
    const b = document.createElement('button'); b.className = 'rec'; b.dataset.nav = ''; b.style.setProperty('--lc', LABEL[song.decade]);
    b.innerHTML = '<span class="disc"></span><span><b></b><small></small></span>' + (mark ? '<span class="ok"></span>' : '');
    b.querySelector('b').textContent = song.title; b.querySelector('small').textContent = `${song.artist} · ${C.DECADE_INFO[song.decade].label} ${song.tag}`;
    if (mark) { b.querySelector('.ok').textContent = mark; b.querySelector('.ok').style.color = markColor; }
    b.setAttribute('aria-label', `Preview ${song.title}`);
    b.addEventListener('click', () => togglePreview(song, b));
    return b;
  }
  function togglePreview(song, el) {
    audio.unlock();
    const same = S.preview && S.preview.el === el; stopPreview(); if (same) return;
    if (!audio.ok) return;
    const arr = A.arrange(song, { fromBar: 2, bars: 5 }); audio.playArrangement(arr, { fadeOut: true });
    el.classList.add('playing'); const timer = setTimeout(stopPreview, arr.length * 1000 + 500);
    S.preview = { el, timer };
  }
  function stopPreview() { if (!S.preview) return; clearTimeout(S.preview.timer); S.preview.el.classList.remove('playing'); S.preview = null; audio.stopClip(0.2); }
  function buildCrate() {
    const tabs = $('crateTabs'); tabs.innerHTML = '';
    C.DECADES.forEach(d => { const b = document.createElement('button'); b.className = 'opt' + (d === S.crateDec ? ' on' : ''); b.dataset.nav = ''; b.innerHTML = `<b>${C.DECADE_INFO[d].label}</b>`; b.addEventListener('click', () => { S.crateDec = d; stopPreview(); buildCrate(); setHL(b.isConnected ? b : tabs.children[C.DECADES.indexOf(d)], true); }); tabs.appendChild(b); });
    document.body.dataset.theme = S.crateDec;
    const list = $('crateList'); list.innerHTML = '';
    C.songsFor(S.crateDec).forEach(s => list.appendChild(recButton(s)));
    if (!S.hl || !S.hl.isConnected) setHL(tabs.children[C.DECADES.indexOf(S.crateDec)], true);
  }
  function buildScores() {
    const modes = ['70s', '80s', '90s', 'all'], diffs = ['easy', 'normal', 'hard'];
    let h = '<table><tr><th></th>' + diffs.map(d => `<th>${Q.DIFFS[d].label}</th>`).join('') + '</tr>';
    modes.forEach(m => { h += `<tr><th>${C.DECADE_INFO[m].label}</th>` + diffs.map(d => { const b = Q.loadBest(store, m, d)[0]; return `<td>${b ? b.score.toLocaleString() + ' <small>(' + b.right + '/10)</small>' : '—'}</td>`; }).join('') + '</tr>'; });
    $('scoreTable').innerHTML = h + '</table><p class="hint">Saved on this device only.</p>';
  }

  // ---------------- pause ----------------
  function setPaused(p) {
    if (S.screen !== 'play' || S.phase === 'done') p = false;
    if (p === S.paused) return;
    S.paused = p; $('pause').hidden = !p;
    if (p) { audio.pause(); $('vol').value = Math.round(audio.volume * 100); setHL($('btnResume'), true); MS.screen('paused'); }
    else { audio.resume(); setHL(S.phase === 'reveal' ? $('btnNext') : null); MS.screen('play'); }
  }
  MS.bindPause({ pause() { setPaused(true); }, resume() { } });
  window.addEventListener('blur', () => { if (S.screen === 'play') setPaused(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (S.screen === 'play') setPaused(true); else if (S.preview) stopPreview(); } });

  // ---------------- highlight + spatial navigation ----------------
  function setHL(el, quiet) {
    if (S.hl) S.hl.classList.remove('hl');
    S.hl = el || null; if (S.hl) { S.hl.classList.add('hl'); if (!quiet) audio.sting('move'); const r = S.hl.getBoundingClientRect(); if (r.top < 40 || r.bottom > innerHeight - 10) S.hl.scrollIntoView({ block: 'nearest' }); }
  }
  function navItems() {
    const scope = S.paused ? $('pause') : $('s-' + S.screen);
    return [...scope.querySelectorAll('[data-nav]')].filter(e => !e.disabled && e.offsetParent !== null && !e.closest('[hidden]'));
  }
  function move(dx, dy) {
    const items = navItems(); if (!items.length) return;
    if (!S.hl || !items.includes(S.hl)) { const first = S.screen === 'play' && S.phase === 'listen' ? items.find(e => e.classList.contains('ch')) : items[0]; return setHL(first || items[0]); }
    const a = S.hl.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const e of items) {
      if (e === S.hl) continue; const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const px = (x - ax) * dx + (y - ay) * dy; if (px <= 4) continue;
      const ortho = Math.abs(dx ? y - ay : x - ax); const sc = px + ortho * 2.2; if (sc < bs) { bs = sc; best = e; }
    }
    if (!best) { const i = items.indexOf(S.hl), j = (dx + dy > 0) ? (i + 1) % items.length : (i - 1 + items.length) % items.length; best = items[j]; }
    setHL(best);
  }
  function activate() {
    if (S.paused) { (S.hl && navItems().includes(S.hl) ? S.hl : $('btnResume')).click(); return; }
    if (S.hl && S.hl.isConnected && !S.hl.disabled && navItems().includes(S.hl)) { S.hl.click(); return; }
    if (S.screen === 'title') startRound();
    else if (S.screen === 'results') startRound();
    else if (S.screen === 'howto' || S.screen === 'scores' || S.screen === 'crate') show('title');
    else if (S.screen === 'play' && S.phase === 'reveal') nextQuestion();
    else if (S.screen === 'play' && S.phase === 'listen') move(0, 1);
  }
  function back() {
    if (S.paused) return setPaused(false);
    if (S.screen === 'play') return setPaused(true);
    if (S.screen === 'title') { location.href = '../../index.html'; return; }
    show('title');
  }

  // ---------------- input wiring ----------------
  document.querySelectorAll('[data-decade]').forEach(b => b.addEventListener('click', e => { S.decade = b.dataset.decade; store.setItem('ntg.decade', S.decade); refreshTitle(); viz.setTheme(S.decade); if (e.detail) setHL($('btnStart'), true); }));
  document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', e => { S.diff = b.dataset.diff; store.setItem('ntg.diff', S.diff); refreshTitle(); if (e.detail) setHL($('btnStart'), true); }));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));
  $('btnStart').addEventListener('click', startRound);
  $('btnAgain').addEventListener('click', startRound);
  $('btnNext').addEventListener('click', () => { if (S.phase === 'reveal') nextQuestion(); });
  $('btn5050').addEventListener('click', useHint);
  $('btnReplay').addEventListener('click', replay);
  $('btnResume').addEventListener('click', () => setPaused(false));
  $('btnRestart').addEventListener('click', () => { setPaused(false); audio.stopClip(0.1); startRound(); });
  $('btnQuit').addEventListener('click', () => { setPaused(false); audio.stopClip(0.2); S.phase = 'idle'; show('title'); });
  $('btnPause').addEventListener('click', () => setPaused(!S.paused));
  const muteBtn = $('btnMute');
  const syncMute = () => { muteBtn.textContent = audio.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound'); };
  muteBtn.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.muted); syncMute(); }); syncMute();
  $('vol').addEventListener('input', e => audio.setVolume(e.target.value / 100));
  ['pointerdown', 'touchend'].forEach(ev => document.addEventListener(ev, () => audio.unlock(), { passive: true }));

  const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  document.addEventListener('keydown', e => {
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable], .mood-card, #mood-sticker-card')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key; audio.unlock();
    if (KEYS[k]) { e.preventDefault(); move(...KEYS[k]); return; }
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); if (!e.repeat) activate(); return; }
    if (k === 'Enter') { e.preventDefault(); if (e.repeat) return; if (S.screen === 'play' && S.phase === 'listen' && !S.paused) useHint(); else activate(); return; }
    if (k === 'Escape' || k === 'p' || k === 'P') { if (k !== 'Escape' && S.screen !== 'play') return; e.preventDefault(); back(); return; }
    if (k === 'm' || k === 'M') { audio.setMuted(!audio.muted); syncMute(); return; }
    if (S.screen === 'play' && S.phase === 'listen' && !S.paused) {
      if (k >= '1' && k <= '4') { e.preventDefault(); answer(+k - 1); return; }
      if (k === 'r' || k === 'R') { replay(); return; }
    }
  });
  document.addEventListener('keyup', e => { if ((e.key === ' ' || e.key === 'Enter') && !(e.target.closest && e.target.closest('input, textarea'))) e.preventDefault(); });

  // gamepad
  const pad = { prev: {}, rep: 0, dir: null };
  function pollPad(dt) {
    const gps = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null; for (const g of gps) if (g && g.connected !== false) { gp = g; break; }
    if (!gp) return;
    const btn = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const edge = i => { const now = btn(i), was = pad.prev[i]; pad.prev[i] = now; return now && !was; };
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let dir = btn(14) || ax < -0.55 ? 'l' : btn(15) || ax > 0.55 ? 'r' : btn(12) || ay < -0.55 ? 'u' : btn(13) || ay > 0.55 ? 'd' : null;
    if (dir !== pad.dir) { pad.dir = dir; pad.rep = 0.38; if (dir) doDir(dir); }
    else if (dir) { pad.rep -= dt; if (pad.rep <= 0) { pad.rep = 0.16; doDir(dir); } }
    const a = edge(0), b = edge(1), x = edge(2), y = edge(3), st = edge(9);
    if (a || b || x || y || st) audio.unlock();
    if (a) activate();
    if (b) back();
    if (x && S.screen === 'play' && S.phase === 'listen') useHint();
    if (y && S.screen === 'play') replay();
    if (st && S.screen === 'play') setPaused(!S.paused); else if (st && S.screen !== 'play') activate();
  }
  function doDir(d) { move(d === 'l' ? -1 : d === 'r' ? 1 : 0, d === 'u' ? -1 : d === 'd' ? 1 : 0); }

  // ---------------- main loop ----------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    pollPad(dt);
    if (S.screen === 'play') {
      if (!S.paused && S.phase === 'listen') {
        S.t += dt;
        const pos = clipPos();
        document.querySelectorAll('#meter i').forEach((el, i) => el.classList.toggle('on', S.arr && pos >= S.arr.stages[i].t));
        const p = potential(), frac = Math.max(0, 1 - S.t / S.clipLen);
        $('ptsBar').style.width = (frac * 100).toFixed(1) + '%'; $('ptsTxt').textContent = '+' + p.total;
        if (pos >= S.clipLen && $('btnReplay').disabled && !S.replayUsed) $('btnReplay').disabled = false;
        if (pos >= S.clipLen + GRACE) answer(-1, true);
      }
      const song = S.round && S.qi >= 0 && S.qi < S.round.questions.length ? curSong() : null;
      const revealed = S.phase === 'reveal';
      viz.draw(S.paused ? 0 : dt, {
        analyser: audio.ok ? audio.analyser : null, playing: !S.paused && (S.phase === 'listen' || revealed), spinning: !S.paused && (S.phase === 'listen' || revealed),
        label: revealed && song ? song.title : '?', sub: revealed && song ? song.artist : 'NAME THAT GROOVE', bpm: S.arr ? S.arr.bpm : 120
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { if (S.hl && S.screen !== 'play') setHL(S.hl, true); });

  // test / debug handle (read-only use from automated tests)
  window.NTG = { S, audio, answer, useHint, startRound, nextQuestion, show, setPaused, move, activate };
  show('title');
})();
