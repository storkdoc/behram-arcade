/* NAME THAT GROOVE: game flow, input (mouse / touch / keyboard / gamepad), screens.
   Songs play through YouTube's official embedded player (yt.js). The player stays full size and on screen;
   while you guess, a listening cover sits over the picture and title (it ignores clicks, so YouTube's own
   controls still work through it) and the bottom control bar stays uncovered. The cover lifts on the reveal. */
(function () {
  'use strict';
  const C = window.NTG_Catalog, Q = window.NTG_Quiz, YTM = window.NTG_YT;
  const $ = id => document.getElementById(id);
  const MS = window.MoodSticker || { event() { }, screen() { }, bindPause() { } };
  const params = new URLSearchParams(location.search);
  const audio = new window.NTG_Audio(), viz = new window.NTG_Viz($('viz'));
  const GRACE = 8;          // seconds to answer after the clip ends
  const TAP_AFTER = 3;      // no music this long after loading -> ask for a tap on the player (mobile autoplay rules)
  const SKIP_AFTER = 8;     // no music this long -> SKIP SONG button
  const STALL_AFTER = 45;   // stuck this long (not waiting on a tap) -> swap the song automatically
  const store = (() => { try { localStorage.setItem('ntg.t', '1'); localStorage.removeItem('ntg.t'); return localStorage; } catch (e) { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; } })();
  const S = {
    screen: 'title', decade: store.getItem('ntg.decade') || 'all', diff: store.getItem('ntg.diff') || 'normal',
    round: null, qi: 0, phase: 'idle', t: 0, clipLen: 15, score: 0, streak: 0, bestStreak: 0, right: 0, hinted: false, removed: [], log: [], paused: false, hl: null, crateDec: '70s',
    media: 'idle', wait: 0, grace: 0, lastCt: -1, ytState: -2, swaps: 0, err: '', muted: false
  };
  if (!C.DECADE_INFO[S.decade]) S.decade = 'all'; if (!Q.DIFFS[S.diff]) S.diff = 'normal';

  // videos that failed on this device recently are skipped for a day
  const BAD_KEY = 'ntg.badvids';
  const bad = (() => { try { const o = JSON.parse(store.getItem(BAD_KEY) || '{}'), now = Date.now(), s = new Set(); for (const k in o) if (now - o[k] < 864e5) s.add(k); return s; } catch (e) { return new Set(); } })();
  // songs whose instrumental video failed here (bad holds YouTube video ids)
  const badSongs = () => new Set(C.SONGS.filter(x => bad.has(x.iyt)).map(x => x.id));
  function markBad(id) { bad.add(id); try { const o = JSON.parse(store.getItem(BAD_KEY) || '{}'); o[id] = Date.now(); store.setItem(BAD_KEY, JSON.stringify(o)); } catch (e) { } }

  // ---------------- YouTube player ----------------
  const mock = params.get('yt') === 'mock';
  const cb = { onState, onError: onYtError, onFail: onYtFail, onReady() { syncNote(); } };
  const yt = mock ? new YTM.Mock('ytHost', cb, { fail: (params.get('ytfail') || '').split(',').filter(Boolean), stall: (params.get('ytstall') || '').split(',').filter(Boolean), needTap: params.has('ytneedtap'), pre: +params.get('ytpre') || 0, apiFail: params.has('ytapifail') })
    : new YTM.Real('ytHost', cb);
  S.muted = audio.muted; yt.mute(S.muted); yt.setVolume(audio.volume * 100);
  yt.load(12000);
  function syncNote() {
    const n = $('ytNote');
    if (yt.status === 'failed') { n.hidden = false; n.innerHTML = "<b>YouTube didn't load,</b> so there's no music to play right now. The songs need an internet connection with YouTube allowed. <button class='link' id='btnYtRetry' data-nav>TRY AGAIN</button>"; $('btnYtRetry').onclick = () => location.reload(); }
    else n.hidden = true;
  }
  function onYtFail() { syncNote(); if (S.screen === 'play' && S.phase === 'listen') setMedia('down'); }
  function curQ() { return S.round && S.round.questions[S.qi]; }
  function curSong() { const q = curQ(); return q ? C.byId(q.answer) : null; }
  function onState(st) {
    S.ytState = st;
    // clicking the player moves keyboard focus into YouTube's frame; bring it back so the game keys keep working
    const f = yt.iframe(); if (f && document.activeElement === f) setTimeout(() => { try { $('stage').focus({ preventScroll: true }); } catch (e) { } }, 0);
    if (S.screen !== 'play') return;
    if (st === 1 && S.paused) yt.pause();
  }
  function onYtError(code, why) {
    if (S.screen === 'play' && S.phase === 'reveal' && S.mode === 'original') { S.mode = 'stopped'; setModeTag(); syncOrigBtn(); toast("The original recording won't play here (" + why + ")."); return; }
    const song = curSong(); if (!song || S.screen !== 'play' || S.phase !== 'listen') return;
    markBad(song.iyt); swapSong(`That video won't play here (${why}). Swapping in another song…`);
  }
  function swapSong(msg) {
    const q = curQ(); if (!q) return;
    if (S.swaps >= 6 || !Q.swapQuestion(S.round, S.qi, new Set([...badSongs(), ...S.round.questions.map(x => x.answer)]))) { setMedia('down', 'No playable songs are left for this round. YouTube may be blocked or the videos unavailable where you are.'); return; }
    S.swaps++; toast(msg); renderQuestion();
  }

  // ---------------- screens ----------------
  function show(name) {
    S.screen = name; document.body.dataset.screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === 's-' + name));
    if (name !== 'play') { yt.stop(); S.media = 'idle'; document.body.classList.remove('revealed'); }
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
    document.body.dataset.theme = S.decade; syncNote();
  }

  // ---------------- round flow ----------------
  function startRound() {
    audio.unlock();
    if (yt.status === 'failed') { syncNote(); toast("YouTube didn't load, so there's no music. Check the connection and tap TRY AGAIN."); return; }
    const seed = params.has('seed') ? (+params.get('seed') >>> 0) : undefined;
    S.round = Q.makeRound({ mode: S.decade, diff: S.diff, seed, exclude: badSongs() });
    S.qi = -1; S.score = 0; S.streak = 0; S.bestStreak = 0; S.right = 0; S.log = []; S.swaps = 0;
    show('play'); audio.sting('start', S.decade === 'all' ? null : S.decade);
    nextQuestion();   // load the first video inside this tap/keypress so the browser allows sound
  }
  function nextQuestion() {
    if (S.screen !== 'play') return;
    S.qi++;
    if (S.qi >= S.round.questions.length) return finishRound();
    renderQuestion();
  }
  function renderQuestion() {
    const q = curQ(), song = curSong(), D = Q.DIFFS[S.diff];
    S.phase = 'listen'; S.hinted = false; S.removed = []; S.t = 0; S.grace = 0; S.wait = 0; S.lastCt = -1; S.clipLen = C.clipLen(song);
    document.body.classList.remove('revealed'); document.body.dataset.theme = q.decade; viz.setTheme(q.decade);
    $('hQ').textContent = `${q.n}/${S.round.questions.length}`; $('hDec').textContent = C.DECADE_INFO[q.decade].label;
    $('hScore').textContent = S.score.toLocaleString(); $('hStreak').textContent = S.streak;
    const box = $('choices'); box.innerHTML = '';
    q.choices.forEach((id, i) => {
      const s = C.byId(id), b = document.createElement('button');
      b.className = 'ch'; b.dataset.nav = ''; b.dataset.i = i; b.setAttribute('aria-label', `${i + 1}: ${s.title}${D.artist ? ' by ' + s.artist : ''}`);
      b.innerHTML = `<span class="n">${i + 1}</span><span><span class="t"></span>${D.artist ? '<span class="tag"></span>' : ''}</span>`;
      b.querySelector('.t').textContent = s.title; if (D.artist) b.querySelector('.tag').textContent = s.artist;
      b.addEventListener('click', () => answer(i));
      box.appendChild(b);
    });
    $('actions').hidden = false; $('reveal').hidden = true;
    $('btn5050').disabled = false; $('btnReplay').disabled = true; $('btnSkip').hidden = true;
    $('flash').className = ''; $('flash').textContent = '';
    setHL(null);
    setMedia(yt.status === 'failed' ? 'down' : 'loading');
    yt.captions(false);
    // guessing always uses the INSTRUMENTAL / karaoke excerpt; the original recording only plays on request after the answer
    S.mode = 'guess'; setModeTag();
    if (yt.status !== 'failed') yt.play(song.iyt, song.istart);   // no endSeconds: the game pauses the clip itself
  }
  const MEDIA_MSG = {
    loading: 'Loading the song from YouTube…', yt: 'YouTube is showing something before the song. Your clip and the clock start right after.', needtap: '▶ Tap the player to start the music', waiting: 'Waiting for YouTube…',
    playing: '', ended: 'Clip over. Name it!', down: "YouTube isn't responding, so the song can't play."
  };
  function setMedia(m, msg) {
    S.media = m; document.body.dataset.media = m;
    const el = $('coverMsg'); el.textContent = msg || MEDIA_MSG[m] || ''; el.hidden = !el.textContent;
    if (m === 'down') { $('btnSkip').hidden = true; $('btnQuitDown').hidden = false; } else $('btnQuitDown').hidden = true;
  }
  function clipPos() { const song = curSong(); return song ? yt.time() - song.istart : 0; }
  function potential() { return Q.scoreAnswer({ correct: true, elapsed: S.t, clipLen: S.clipLen, streak: S.streak, hinted: S.hinted }); }

  // called every frame while guessing: the clock only runs while the song is actually being heard
  function tickListen(dt) {
    const song = curSong(); if (!song) return;
    const st = yt.state(), ct = yt.time(), pos = ct - song.istart;
    const moving = S.lastCt >= 0 && Math.abs(ct - S.lastCt) > 0.0005;
    const progressing = st === 1 && moving && pos > -1 && pos < S.clipLen + 1.5;
    // the player's clock is running but not inside our excerpt: YouTube is showing something of its own first
    const foreign = moving && !progressing && (pos < -1 || pos > S.clipLen + 1.5) && S.media !== 'ended';
    if (S.media === 'ended') {
      S.grace += dt; if (S.grace >= GRACE) answer(-1, true);
    } else if (foreign) {
      S.wait += dt; if (S.media !== 'yt') setMedia('yt');   // lift the cover; never hide what YouTube is showing
      if (S.wait > SKIP_AFTER) $('btnSkip').hidden = false;
    } else if (S.media === 'down') {
      /* nothing to wait for; QUIT or SKIP */
    } else if (progressing) {
      if (S.media !== 'playing') setMedia('playing');
      S.wait = 0; S.t = Math.max(S.t, Math.min(S.clipLen, Math.max(0, pos)));
      if (pos >= S.clipLen) endClip();
    } else if (st === 0 && S.lastCt >= 0 && pos >= S.clipLen - 1) {
      endClip();   // YouTube stopped at our end time
    } else {
      S.wait += dt;
      const idle = st === -1 || st === 5 || st === 2 || st === -2;
      if (st === 1 && S.wait > 1.5 && S.media !== 'yt') setMedia('yt');   // YouTube is playing something that isn't our clip: lift the cover, don't hide it
      else if (idle && S.wait > TAP_AFTER && S.media !== 'needtap') setMedia('needtap');
      else if (st === 3 && S.wait > 2 && S.media !== 'waiting' && S.media !== 'yt') setMedia('waiting');
      if (S.wait > SKIP_AFTER) $('btnSkip').hidden = false;
      if (st === 3 && S.wait > STALL_AFTER) { markBad(song.iyt); swapSong("That song is stuck loading. Swapping in another…"); }
    }
    S.lastCt = ct;
  }
  function endClip() { yt.pause(); setMedia('ended'); $('btnReplay').disabled = false; S.grace = 0; }

  function answer(i, timedOut) {
    if (S.screen !== 'play' || S.phase !== 'listen' || S.paused) return;
    if (!timedOut && S.removed.includes(i)) return;
    const q = curQ(), song = curSong();
    const correct = !timedOut && i === q.correct;
    const res = Q.scoreAnswer({ correct, elapsed: S.t, clipLen: S.clipLen, streak: S.streak, hinted: S.hinted });
    S.phase = 'reveal'; S.score += res.total; S.streak = res.streak; S.bestStreak = Math.max(S.bestStreak, S.streak); if (correct) S.right++;
    S.log.push({ id: song.id, correct, picked: timedOut ? -1 : q.choices[i], pts: res.total, time: +S.t.toFixed(2) });
    document.querySelectorAll('.ch').forEach((b, k) => { b.disabled = true; if (k === q.correct) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); });
    const fl = $('flash'); fl.textContent = correct ? (S.streak >= 5 ? 'ON FIRE!' : S.streak >= 3 ? `${S.streak} IN A ROW!` : S.t < S.clipLen * 0.35 ? 'NAILED IT!' : 'RIGHT ON!') : timedOut ? "TIME'S UP" : 'NOPE!';
    fl.style.color = correct ? '#45ff9a' : '#ff4d6d'; fl.className = ''; void fl.offsetWidth; fl.className = 'show';
    $('rvMark').textContent = correct ? '✓' : '✗'; $('rvMark').style.color = correct ? '#45ff9a' : '#ff4d6d';
    $('rvTitle').textContent = song.title;
    $('rvSub').textContent = `${song.artist} · ${song.year}`;
    S.origUsed = false; syncOrigBtn();
    $('rvPts').textContent = correct ? `+${res.total}` : '+0';
    $('rvPts').title = correct ? `100 base + ${res.speed} speed${S.hinted ? ', halved for 50:50' : ''}, ×${res.mult} streak` : '';
    $('actions').hidden = true; $('reveal').hidden = false;
    $('hScore').textContent = S.score.toLocaleString(); $('hStreak').textContent = S.streak;
    // lift the cover: the video, its title and channel are now on show, and the song keeps playing
    document.body.classList.add('revealed'); yt.captions(true); setMedia(S.media === 'down' ? 'down' : 'playing', S.media === 'down' ? MEDIA_MSG.down : '');
    // the instrumental is left as it is (paused if its excerpt ended); the original plays only via HEAR ORIGINAL
    setHL($('btnNext'), true);
    audio.sting(correct ? 'right' : 'wrong', song.decade);
    if (correct) { MS.event(S.streak >= 3 || res.speed > 100 ? 'big' : 'start'); } else MS.event('hit');
  }

  function useHint() {
    if (S.phase !== 'listen' || S.hinted || S.paused) return;
    const q = curQ();
    S.hinted = true; S.removed = Q.fiftyFifty(q, S.round.seed);
    document.querySelectorAll('.ch').forEach((b, k) => { if (S.removed.includes(k)) { b.classList.add('gone'); b.disabled = true; } });
    if (S.hl && S.hl.disabled) setHL(null);
    $('btn5050').disabled = true; audio.sting('move');
  }
  function replay() {
    if (S.phase !== 'listen' || S.paused || S.media !== 'ended') return;
    // replays the same fixed excerpt: seek back to its start; the game pauses again at its end
    const song = curSong(); S.grace = 0; S.lastCt = -1; setMedia('loading');
    yt.seek(song.istart); $('btnReplay').disabled = true;
  }
  function skip() { if (S.phase !== 'listen' || $('btnSkip').hidden) return; const s = curSong(); if (s) markBad(s.iyt); swapSong('Skipped. Here comes another song…'); }

  function finishRound() {
    S.phase = 'done'; yt.stop();
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
    S.log.forEach(L => list.appendChild(recLink(C.byId(L.id), L.correct ? '✓' : '✗', L.correct ? '#45ff9a' : '#ff4d6d')));
    document.body.dataset.theme = S.decade;
    show('results');
    audio.sting(acc >= 0.7 ? 'fanfare' : acc >= 0.4 ? 'right' : 'wrong', S.decade === 'all' ? null : S.decade);
    MS.event(isNew || acc >= 0.8 ? 'win' : acc < 0.4 ? 'lose' : 'big');
  }

  // ---------------- record crate (song list, each opens on YouTube) ----------------
  const LABEL = { '70s': '#ff8a00', '80s': '#ff3cac', '90s': '#00e5c7' };
  function recLink(song, mark, markColor) {
    // plain song card: no links out and no audio (the crate is a song list, never a way to hear originals early)
    const a = document.createElement('div'); a.className = 'rec'; a.style.setProperty('--lc', LABEL[song.decade]);
    a.innerHTML = '<span class="disc"></span><span><b></b><small></small></span>' + (mark ? '<span class="ok"></span>' : '');
    a.querySelector('b').textContent = song.title; a.querySelector('small').textContent = `${song.artist} · ${song.year}`;
    if (mark) { a.querySelector('.ok').textContent = mark; a.querySelector('.ok').style.color = markColor; }
    return a;
  }
  // ---------------- HEAR ORIGINAL (after the answer only) ----------------
  function setModeTag() {
    const el = $('modeTag'), song = curSong(); if (!el) return;
    if (S.mode === 'original') { el.textContent = '● ORIGINAL RECORDING'; el.className = 'orig'; }
    else { el.textContent = song && song.kind === 'karaoke' ? 'KARAOKE BACKING TRACK' : 'INSTRUMENTAL'; el.className = ''; }
  }
  function syncOrigBtn() { const b = $('btnOrig'); b.textContent = S.mode === 'original' ? '■ STOP ORIGINAL' : '▶ HEAR ORIGINAL'; b.setAttribute('aria-pressed', S.mode === 'original'); b.insertAdjacentHTML('beforeend', ' <kbd>ENTER</kbd>'); }
  function toggleOriginal() {
    if (S.screen !== 'play' || S.phase !== 'reveal' || S.paused) return;
    const song = curSong(); if (!song) return;
    if (S.mode === 'original') { yt.pause(); S.mode = 'stopped'; }
    else { audio.unlock(); S.mode = 'original'; S.origUsed = true; yt.captions(true); yt.play(song.yt, song.start); }
    setModeTag(); syncOrigBtn();
  }
  function tickReveal() {
    const song = curSong(); if (!song) return;
    const t = yt.time();
    if (S.mode === 'guess' && yt.state() === 1 && t >= song.iend) { yt.pause(); S.mode = 'stopped'; }
    if (S.mode === 'original' && yt.state() === 1 && t >= song.end) { yt.pause(); S.mode = 'stopped'; setModeTag(); syncOrigBtn(); }
  }
  function buildCrate() {
    const tabs = $('crateTabs'); tabs.innerHTML = '';
    C.DECADES.forEach(d => { const b = document.createElement('button'); b.className = 'opt' + (d === S.crateDec ? ' on' : ''); b.dataset.nav = ''; b.innerHTML = `<b>${C.DECADE_INFO[d].label}</b>`; b.addEventListener('click', () => { S.crateDec = d; buildCrate(); setHL(tabs.children[C.DECADES.indexOf(d)], true); }); tabs.appendChild(b); });
    document.body.dataset.theme = S.crateDec;
    const list = $('crateList'); list.innerHTML = '';
    C.songsFor(S.crateDec).forEach(s => list.appendChild(recLink(s)));
    if (!S.hl || !S.hl.isConnected) setHL(tabs.children[C.DECADES.indexOf(S.crateDec)], true);
  }
  function buildScores() {
    const modes = ['70s', '80s', '90s', 'all'], diffs = ['easy', 'normal', 'hard'];
    let h = '<table><tr><th></th>' + diffs.map(d => `<th>${Q.DIFFS[d].label}</th>`).join('') + '</tr>';
    modes.forEach(m => { h += `<tr><th>${C.DECADE_INFO[m].label}</th>` + diffs.map(d => { const b = Q.loadBest(store, m, d)[0]; return `<td>${b ? b.score.toLocaleString() + ' <small>(' + b.right + '/10)</small>' : '—'}</td>`; }).join('') + '</tr>'; });
    $('scoreTable').innerHTML = h + '</table><p class="hint">Saved on this device only.</p>';
  }

  // ---------------- toast ----------------
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3800); }

  // ---------------- pause ----------------
  function setPaused(p) {
    if (S.screen !== 'play' || S.phase === 'done') p = false;
    if (p === S.paused) return;
    S.paused = p; $('pause').hidden = !p;
    if (p) { yt.pause(); audio.pause(); $('vol').value = Math.round(audio.volume * 100); setHL($('btnResume'), true); MS.screen('paused'); }
    else {
      audio.resume(); setHL(S.phase === 'reveal' ? $('btnNext') : null); MS.screen('play');
      if ((S.phase === 'reveal' && (S.mode === 'original' || S.mode === 'guess')) || (S.phase === 'listen' && S.media !== 'ended' && S.media !== 'down')) yt.resume();
    }
  }
  MS.bindPause({ pause() { setPaused(true); }, resume() { } });
  // the window also "blurs" when you tap into the YouTube player itself; that must not pause the game
  window.addEventListener('blur', () => setTimeout(() => { const f = yt.iframe(); if (f && document.activeElement === f) return; if (S.screen === 'play' && !document.hasFocus()) setPaused(true); }, 0));
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.screen === 'play') setPaused(true); });

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
    else if (S.screen === 'play' && S.phase === 'listen') { if (S.media === 'needtap') yt.resume(); move(0, 1); }
  }
  function back() {
    if (S.paused) return setPaused(false);
    if (S.screen === 'play') return setPaused(true);
    if (S.screen === 'title') { location.href = '../../index.html'; return; }
    show('title');
  }
  function quit() { setPaused(false); S.phase = 'idle'; show('title'); }

  // ---------------- input wiring ----------------
  document.querySelectorAll('[data-decade]').forEach(b => b.addEventListener('click', e => { S.decade = b.dataset.decade; store.setItem('ntg.decade', S.decade); refreshTitle(); viz.setTheme(S.decade); if (e.detail) setHL($('btnStart'), true); }));
  document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', e => { S.diff = b.dataset.diff; store.setItem('ntg.diff', S.diff); refreshTitle(); if (e.detail) setHL($('btnStart'), true); }));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));
  $('btnStart').addEventListener('click', startRound);
  $('btnAgain').addEventListener('click', startRound);
  $('btnNext').addEventListener('click', () => { if (S.phase === 'reveal') nextQuestion(); });
  $('btn5050').addEventListener('click', useHint);
  $('btnReplay').addEventListener('click', replay);
  $('btnSkip').addEventListener('click', skip);
  $('btnOrig').addEventListener('click', toggleOriginal);
  $('btnQuitDown').addEventListener('click', quit);
  $('btnResume').addEventListener('click', () => setPaused(false));
  $('btnRestart').addEventListener('click', () => { setPaused(false); startRound(); });
  $('btnQuit').addEventListener('click', quit);
  $('btnPause').addEventListener('click', () => setPaused(!S.paused));
  const muteBtn = $('btnMute');
  const setMuted = m => { S.muted = m; audio.setMuted(m); yt.mute(m); syncMute(); };
  const syncMute = () => { muteBtn.textContent = S.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', S.muted ? 'Unmute sound' : 'Mute sound'); };
  muteBtn.addEventListener('click', () => { audio.unlock(); setMuted(!S.muted); }); syncMute();
  $('vol').addEventListener('input', e => { audio.setVolume(e.target.value / 100); yt.setVolume(+e.target.value); });
  ['pointerdown', 'touchend'].forEach(ev => document.addEventListener(ev, () => audio.unlock(), { passive: true }));

  const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  document.addEventListener('keydown', e => {
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable], .mood-card, #mood-sticker-card')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key; audio.unlock();
    if (KEYS[k]) { e.preventDefault(); move(...KEYS[k]); return; }
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); if (!e.repeat) activate(); return; }
    if (k === 'Enter') { e.preventDefault(); if (e.repeat) return; if (S.screen === 'play' && S.phase === 'listen' && !S.paused) useHint(); else if (S.screen === 'play' && S.phase === 'reveal' && !S.paused) toggleOriginal(); else activate(); return; }
    if (k === 'Escape' || k === 'p' || k === 'P') { if (k !== 'Escape' && S.screen !== 'play') return; e.preventDefault(); back(); return; }
    if (k === 'm' || k === 'M') { setMuted(!S.muted); return; }
    if ((k === 'o' || k === 'O') && S.screen === 'play' && S.phase === 'reveal' && !S.paused) { toggleOriginal(); return; }
    if (S.screen === 'play' && S.phase === 'listen' && !S.paused) {
      if (k >= '1' && k <= '4') { e.preventDefault(); answer(+k - 1); return; }
      if (k === 'r' || k === 'R') { replay(); return; }
      if (k === 's' || k === 'S') { skip(); return; }
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
    if (y && S.screen === 'play') { if (S.phase === 'reveal') toggleOriginal(); else replay(); }
    if (x && S.screen === 'play' && S.phase === 'reveal') toggleOriginal();
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
        tickListen(dt);
        const p = potential(), frac = Math.max(0, 1 - S.t / S.clipLen);
        $('ptsBar').style.width = (frac * 100).toFixed(1) + '%'; $('ptsTxt').textContent = '+' + p.total;
        $('clock').textContent = S.media === 'ended' ? `ANSWER IN ${Math.max(0, Math.ceil(GRACE - S.grace))}` : `${Math.floor(S.t)}s / ${S.clipLen}s`;
      }
      if (!S.paused && S.phase === 'reveal') tickReveal();
      if (S.phase !== 'reveal') viz.draw(S.paused ? 0 : dt, { analyser: null, playing: !S.paused && S.media === 'playing', spinning: !S.paused && S.media === 'playing', label: '?', sub: 'NAME THAT GROOVE', bpm: 116 });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { if (S.hl && S.screen !== 'play') setHL(S.hl, true); });

  // test / debug handle (read-only use from automated tests)
  window.NTG = { S, yt, audio, answer, useHint, startRound, nextQuestion, show, setPaused, move, activate, skip, bad, toggleOriginal };
  show('title');
})();
