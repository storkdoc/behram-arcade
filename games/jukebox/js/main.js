/* JUKEBOX: cabinet, queue and input.
   Songs play only after an explicit Play (button, Space, or gamepad A), through the
   official YouTube player in player.js. This file never hides that player, never
   builds a second one, and never reads cookies. */
(function () {
  'use strict';
  const cat = window.JukeCatalog;
  const Queue = window.JukeQueue;
  const YT = window.JukePlayer;
  const $ = id => document.getElementById(id);
  const MS = window.MoodSticker || { event() {}, screen() {}, bindPause() {}, isOpen() { return false; } };
  const params = new URLSearchParams(location.search);
  const sfx = new window.JukeSfx();

  const store = (() => {
    try { localStorage.setItem('jukebox.t', '1'); localStorage.removeItem('jukebox.t'); return localStorage; }
    catch (e) {
      const m = {};
      return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
    }
  })();

  const valid = new Set(cat.SONGS.map(s => s.id));
  let saved = {};
  try { saved = JSON.parse(store.getItem('jukebox.prefs') || '{}') || {}; } catch (e) { saved = {}; }
  const restored = Queue.restore(saved, valid);
  const Q = restored.state;
  let favorites = restored.favorites;

  const S = {
    mode: 'idle',
    overlay: null,
    resumeAfter: false,
    stickerHeld: false,
    hl: null,
    hlKey: '',
    tab: restored.decade,
    vol: restored.volume,
    muted: restored.muted,
    errorStreak: 0,
    bad: new Set(),
    ytState: -2
  };

  const mock = params.get('yt') === 'mock';
  const player = mock
    ? new YT.Mock('ytHost', { onReady, onState, onError, onFail }, {
      fail: (params.get('ytfail') || '').split(',').filter(Boolean),
      apiFail: params.has('ytapifail'),
      noauto: params.has('ytnoauto')
    })
    : new YT.Real('ytHost', { onReady, onState, onError, onFail });
  player.setVolume(S.vol);
  player.mute(S.muted);

  function onReady() {
    const idle = $('ytIdle');
    if (idle) idle.hidden = true;
    if (S.mode === 'idle' && !player.currentId) setStatus('Press Play to start. Nothing plays until you do.');
    syncNote();
  }
  function onFail() { syncNote(); setStatus("YouTube didn't load. Check the connection, then press Play to try again."); }
  function syncNote() {
    if (player.status === 'failed') setStatus("YouTube didn't load, so there's no music yet. It needs a connection that allows youtube.com.");
  }

  function currentId() { return Queue.current(Q); }
  function currentSong() { const id = currentId(); return id ? cat.byId(id) : null; }

  function setStatus(text, sticky) {
    S.stickyStatus = !!sticky && !!text;
    $('status').textContent = text || '';
  }

  function save() {
    try {
      store.setItem('jukebox.prefs', JSON.stringify(Queue.serialize(Q, {
        favorites, volume: S.vol, muted: S.muted, decade: S.tab
      })));
    } catch (e) { /* private mode or a full disk */ }
  }

  function setMode(mode) {
    S.mode = mode;
    document.body.dataset.mode = mode;
    document.body.dataset.screen = S.overlay || (mode === 'idle' ? 'listen' : 'play');
    const viz = $('vizPanel');
    if (viz) viz.dataset.state = mode;
    MS.screen(document.body.dataset.screen);
  }

  function themeDecade() {
    const song = currentSong();
    if (song && song.decade) return song.decade;
    if (S.tab === '70s' || S.tab === '80s' || S.tab === '90s') return S.tab;
    return 'all';
  }

  function onState(st) {
    S.ytState = st;
    if (S.overlay && st === 1) { player.pause(); return; }
    if (st === 1) {
      S.errorStreak = 0;
      setMode('playing');
      if (!S.stickyStatus) setStatus('');
      MS.event('start');
    } else if (st === 2) {
      if (S.mode === 'playing' || S.mode === 'loading') setMode('paused');
    } else if (st === 3) {
      if (S.mode !== 'playing' && S.mode !== 'paused') setMode('loading');
    } else if (st === 0) {
      onEnded();
    }
    syncChrome();
  }

  function onEnded() {
    if (S.mode === 'idle') return;
    if (Q.repeat === 'one' && currentSong()) {
      player.replay();
      return;
    }
    const nxt = Queue.next(Q);
    save();
    if (!nxt) {
      setMode('ended');
      setStatus('End of the queue.');
      syncChrome();
      renderQueue();
      return;
    }
    beginLoad();
  }

  function onError(code, why) {
    const song = currentSong();
    if (song) S.bad.add(song.yt);
    S.errorStreak++;
    const label = song ? song.title : 'That video';
    const msg = label + " won't play here (" + why + ').';
    renderQueue();
    if (S.errorStreak >= 4) {
      setMode('error');
      setStatus(msg + ' Several videos failed. Press Next to try another.');
      syncChrome();
      return;
    }
    const nxt = Queue.next(Q, { force: true });
    save();
    if (nxt && !S.bad.has(cat.byId(nxt).yt)) {
      setStatus(msg + ' Skipping to the next song.', true);
      beginLoad({ keepStatus: true });
    } else {
      setMode('error');
      setStatus(msg + ' Press Next or pick another song.', true);
      syncChrome();
    }
  }

  function beginLoad(opts) {
    opts = opts || {};
    const song = currentSong();
    if (!song) { setStatus('Add a song, then press Play.'); return; }
    if (S.bad.has(song.yt) && !opts.retry) {
      setMode('error');
      setStatus(song.title + " didn't play here earlier. Press Next, or Play to try it again.");
      syncChrome();
      return;
    }
    $('ytIdle').hidden = true;
    setMode('loading');
    if (!opts.keepStatus) setStatus('Loading from YouTube…');
    player.play(song.yt);
    syncChrome();
    renderQueue();
    markCurrent();
    save();
  }

  function pausePlayback() {
    const active = S.mode === 'playing' || S.mode === 'loading' || player.state() === 1;
    if (!active) return;
    setStatus('Paused');
    player.pause();
    setMode('paused');
    syncChrome();
  }

  function resumePlayback() {
    if (!player.currentId && currentSong()) { beginLoad(); return; }
    setMode('loading');
    setStatus('');
    player.resume();
    syncChrome();
  }

  function highlightedSongId() {
    const el = S.hl;
    if (el && (el.dataset.act === 'add' || el.dataset.act === 'fav') && el.dataset.id) return el.dataset.id;
    return S.songPick || null;
  }

  function userPlayPause() {
    if (MS.isOpen && MS.isOpen()) return;
    S.stickyStatus = false;
    sfx.unlock();
    if (S.overlay) { closeOverlay(true); return; }
    const st = player.state();
    /* Only an actually playing video should pause. A second Play while YouTube
       is still unstarted or buffering is another user gesture, so retry there. */
    if (st === 1) { pausePlayback(); return; }
    if (S.mode === 'paused' && st === 2) { resumePlayback(); return; }
    if ((S.mode === 'loading' || S.mode === 'paused') && currentSong()) {
      $('ytIdle').hidden = true;
      setMode('loading');
      setStatus(st === -1 || st === 5 ? 'Press Play again if the song has not started.' : 'Loading from YouTube…');
      if (player.ready() && player.currentId === currentSong().yt) player.resume();
      else player.play(currentSong().yt);
      syncChrome();
      return;
    }
    if (S.mode === 'error') {
      const song = currentSong();
      if (song) S.bad.delete(song.yt);
      if (!currentSong()) {
        if (!Q.queue.length) { setStatus('Add a song, then press Play.'); return; }
        Queue.start(Q);
      }
      beginLoad({ retry: true });
      return;
    }
    if (S.mode === 'ended' && player.currentId && currentSong() && currentSong().yt === player.currentId) {
      $('ytIdle').hidden = true;
      setMode('loading');
      player.replay();
      syncChrome();
      return;
    }
    if (!Q.queue.length) {
      const id = highlightedSongId();
      if (id) addToQueue(id, true);
    }
    if (!Q.queue.length) { setStatus('Add a song, then press Play.'); return; }
    if (Q.index < 0 || Q.index >= Q.queue.length) Queue.start(Q);
    beginLoad();
  }

  function userNext() {
    S.stickyStatus = false;
    sfx.unlock();
    const playing = S.mode === 'playing' || S.mode === 'loading' || S.mode === 'paused' || S.mode === 'error';
    const id = Queue.next(Q, { force: true });
    save();
    renderQueue();
    if (!id) {
      setMode(Q.queue.length ? 'ended' : 'idle');
      setStatus(Q.queue.length ? 'End of the queue.' : 'Queue is empty.');
      syncChrome();
      return;
    }
    if (!playing) {
      setStatus('Up next. Press Play.');
      syncChrome();
      markCurrent();
      return;
    }
    const song = cat.byId(id);
    if (song) S.bad.delete(song.yt);
    beginLoad({ retry: true });
  }

  function userPrev() {
    S.stickyStatus = false;
    sfx.unlock();
    const playing = S.mode === 'playing' || S.mode === 'paused' || S.mode === 'loading';
    if (playing && player.time() > 3) { player.replay(); return; }
    const id = Queue.prev(Q);
    save();
    renderQueue();
    if (!id) return;
    if (!playing && S.mode !== 'error') {
      syncChrome();
      markCurrent();
      return;
    }
    const song = cat.byId(id);
    if (song) S.bad.delete(song.yt);
    beginLoad({ retry: true });
  }

  function addToQueue(id, quiet) {
    if (!cat.byId(id)) return;
    Queue.add(Q, id);
    if (!quiet) { sfx.unlock(); sfx.click(); }
    renderQueue();
    save();
    if (S.mode === 'idle' || S.mode === 'ended') setStatus('Added. Press Play when you want it.');
    MS.event('big');
  }

  function removeAt(i) {
    const keepPlaying = S.mode === 'playing' || S.mode === 'loading';
    const res = Queue.removeAt(Q, i);
    if (!res.ok) return;
    sfx.click();
    renderQueue();
    save();
    if (!Q.queue.length) {
      player.pause();
      setMode('idle');
      setStatus('Queue cleared.');
      syncChrome();
      return;
    }
    if (res.removedCurrent && keepPlaying) beginLoad({ retry: true });
    else syncChrome();
  }

  function jump(i) {
    const id = Queue.jump(Q, i);
    if (!id) return;
    sfx.unlock();
    const song = cat.byId(id);
    if (song) S.bad.delete(song.yt);
    beginLoad({ retry: true });
  }

  function toggleFav(id) {
    Queue.toggleFav(favorites, id);
    sfx.unlock();
    sfx.click();
    const favBtn = document.querySelector('[data-tab="fav"]');
    if (favBtn) favBtn.textContent = cat.DECADE_INFO.fav.label + ' ' + favorites.length;
    if (S.tab === 'fav') renderSongs();
    else syncHearts();
    save();
    MS.event('big');
  }

  function setTab(tab) {
    if (cat.TABS.indexOf(tab) < 0) return;
    S.tab = tab;
    sfx.click();
    renderTabs();
    renderSongs();
    save();
    syncChrome();
  }

  function visibleSongs() {
    const base = S.tab === 'fav' ? cat.SONGS.filter(s => favorites.indexOf(s.id) >= 0)
      : S.tab === 'all' ? cat.SONGS.slice()
        : cat.songsFor(S.tab);
    return base;
  }

  function renderTabs() {
    const host = $('tabs');
    host.innerHTML = '';
    cat.TABS.forEach(tab => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.dataset.nav = '';
      b.dataset.k = 'tab:' + tab;
      b.dataset.tab = tab;
      b.setAttribute('role', 'tab');
      const on = tab === S.tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      const n = tab === 'fav' ? favorites.length : cat.songsFor(tab === 'fav' ? 'all' : tab).length;
      b.textContent = cat.DECADE_INFO[tab].label + ' ' + n;
      b.addEventListener('click', () => setTab(tab));
      host.appendChild(b);
    });
    const info = cat.DECADE_INFO[S.tab];
    $('crateNote').textContent = S.tab === 'fav'
      ? (favorites.length ? 'Saved on this device only.' : 'No favorites yet. Press the heart on a song.')
      : info.long + ' · tap a strip or press Enter to add it.';
  }

  function renderSongs() {
    const list = $('songList');
    const keep = S.hlKey;
    list.innerHTML = '';
    const songs = visibleSongs();
    if (!songs.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = S.tab === 'fav' ? 'No favorites yet. Hearts you tap are kept on this device.' : 'Nothing in this decade.';
      list.appendChild(p);
      restoreHL(keep);
      return;
    }
    songs.forEach(song => {
      const li = document.createElement('li');
      li.className = 'strip';
      li.dataset.id = song.id;
      li.dataset.decade = song.decade;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'song';
      b.dataset.nav = '';
      b.dataset.k = 'add:' + song.id;
      b.dataset.act = 'add';
      b.dataset.id = song.id;
      b.setAttribute('aria-label', 'Add ' + song.title + ' by ' + song.artist);
      const yr = document.createElement('span');
      yr.className = 'yr';
      yr.textContent = String(song.year);
      const meta = document.createElement('span');
      meta.className = 'meta';
      const tt = document.createElement('span');
      tt.className = 'tt';
      tt.textContent = song.title;
      const ar = document.createElement('span');
      ar.className = 'ar';
      ar.textContent = song.artist + ' · ' + song.genre;
      meta.append(tt, ar);
      b.append(yr, meta);
      const heart = document.createElement('button');
      heart.type = 'button';
      heart.className = 'heart';
      heart.dataset.nav = '';
      heart.dataset.k = 'fav:' + song.id;
      heart.dataset.act = 'fav';
      heart.dataset.id = song.id;
      heart.textContent = '♥';
      heart.setAttribute('aria-label', 'Favorite ' + song.title + ' by ' + song.artist);
      li.append(b, heart);
      list.appendChild(li);
    });
    markCurrent();
    syncHearts();
    restoreHL(keep);
  }

  function renderQueue() {
    const list = $('queue');
    const keep = S.hlKey;
    list.innerHTML = '';
    $('btnClear').disabled = Q.queue.length === 0;
    if (!Q.queue.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Queue is empty. Highlight a song and press Enter.';
      list.appendChild(p);
      restoreHL(keep);
      return;
    }
    Q.queue.forEach((id, i) => {
      const song = cat.byId(id);
      if (!song) return;
      const li = document.createElement('li');
      li.className = 'qrow';
      li.dataset.i = String(i);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qplay';
      b.dataset.nav = '';
      b.dataset.k = 'q:' + i;
      b.dataset.act = 'jump';
      b.dataset.i = String(i);
      b.setAttribute('aria-label', 'Play ' + song.title + ' now');
      const title = document.createElement('b');
      title.textContent = song.title;
      const sub = document.createElement('small');
      sub.textContent = song.artist;
      b.append(title, sub);
      li.appendChild(b);
      [['up', 'Move up', '↑', -1], ['down', 'Move down', '↓', 1], ['rm', 'Remove from queue', '✕', 0]].forEach(spec => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qbtn';
        btn.dataset.nav = '';
        btn.dataset.k = spec[0] + ':' + i;
        btn.dataset.act = spec[0];
        btn.dataset.i = String(i);
        btn.setAttribute('aria-label', spec[1] + ' ' + song.title);
        btn.textContent = spec[2];
        if (spec[0] === 'up') btn.disabled = i === 0;
        if (spec[0] === 'down') btn.disabled = i === Q.queue.length - 1;
        li.appendChild(btn);
      });
      list.appendChild(li);
    });
    markCurrent();
    restoreHL(keep);
  }

  function markCurrent() {
    const id = currentId();
    const live = S.mode === 'playing' || S.mode === 'paused' || S.mode === 'loading' || S.mode === 'error';
    document.querySelectorAll('.strip').forEach(el => {
      const on = live && el.dataset.id === id;
      el.classList.toggle('is-current', on);
      if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
    });
    document.querySelectorAll('.qrow').forEach(el => {
      const on = String(Q.index) === el.dataset.i && Q.index >= 0;
      el.classList.toggle('is-current', on);
      if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
    });
  }

  function syncHearts() {
    document.querySelectorAll('[data-act="fav"]').forEach(b => {
      const on = favorites.indexOf(b.dataset.id) >= 0;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    });
  }

  function syncChrome() {
    const song = currentSong();
    document.body.dataset.decade = themeDecade();
    const lab = $('vlabel');
    if (lab) lab.textContent = song ? String(song.year).slice(2) : (document.body.dataset.decade === 'all' ? 'ALL' : document.body.dataset.decade);
    const live = S.mode === 'playing' || S.mode === 'paused' || S.mode === 'loading';
    $('npKicker').textContent = live ? 'NOW PLAYING' : (song ? 'UP NEXT' : 'JUKEBOX');
    $('npTitle').textContent = song ? song.title : 'Nothing queued';
    $('npMeta').textContent = song ? (song.artist + ' · ' + song.year + ' · ' + song.genre) : 'Add a hit from the selector';
    const playing = S.mode === 'playing';
    $('btnPlay').textContent = playing ? 'PAUSE' : 'PLAY';
    $('btnPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('btnShuffle').setAttribute('aria-pressed', Q.shuffle ? 'true' : 'false');
    $('btnShuffle').textContent = Q.shuffle ? 'SHUFFLE ON' : 'SHUFFLE';
    const rep = Q.repeat === 'all' ? 'REPEAT ALL' : Q.repeat === 'one' ? 'REPEAT ONE' : 'REPEAT';
    $('btnRepeat').textContent = rep;
    $('btnRepeat').setAttribute('aria-pressed', Q.repeat === 'off' ? 'false' : 'true');
    $('btnMute').textContent = S.muted ? 'UNMUTE' : 'MUTE';
    $('btnMute').setAttribute('aria-pressed', S.muted ? 'true' : 'false');
    $('btnMute').setAttribute('aria-label', S.muted ? 'Unmute' : 'Mute');
    if (document.activeElement !== $('vol')) $('vol').value = String(S.vol);
    markCurrent();
  }

  function fillPremium() {
    const note = $('premiumNote');
    note.textContent = '';
    note.append(document.createTextNode(cat.PREMIUM_NOTE + ' '));
    const a = document.createElement('a');
    a.href = cat.PREMIUM_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = "YouTube's note on Premium and embedded videos";
    note.append(a);
    $('helpPremium').textContent = cat.SOURCE_NOTE + ' ' + cat.PREMIUM_NOTE;
  }

  function openOverlay(name) {
    if (S.overlay === name) { closeOverlay(true); return; }
    const carry = S.resumeAfter || S.mode === 'playing' || S.mode === 'loading';
    if (S.overlay) {
      S.resumeAfter = false;
      $('pause').hidden = true;
      $('help').hidden = true;
      S.overlay = null;
    }
    S.resumeAfter = carry;
    if (S.mode === 'playing' || S.mode === 'loading') pausePlayback();
    S.overlay = name;
    $('pause').hidden = name !== 'pause';
    $('help').hidden = name !== 'help';
    $('cabinet').inert = true;
    document.body.dataset.screen = name;
    MS.screen(name);
    const focus = name === 'pause' ? $('btnResume') : $('btnCloseHelp');
    setHL(focus, { quiet: true });
  }

  function closeOverlay(andResume) {
    if (!S.overlay) return;
    const resume = !!S.resumeAfter && andResume !== false;
    S.overlay = null;
    S.resumeAfter = false;
    $('pause').hidden = true;
    $('help').hidden = true;
    $('cabinet').inert = false;
    document.body.dataset.screen = S.mode === 'idle' ? 'listen' : 'play';
    MS.screen(document.body.dataset.screen);
    if (resume) resumePlayback();
    else syncChrome();
  }

  let focusing = false;
  function setHL(el, opts) {
    opts = opts || {};
    if (S.hl) S.hl.classList.remove('hl');
    S.hl = el || null;
    if (!S.hl) return;
    S.hlKey = S.hl.dataset.k || '';
    if ((S.hl.dataset.act === 'add' || S.hl.dataset.act === 'fav') && S.hl.dataset.id) S.songPick = S.hl.dataset.id;
    if (opts.show !== false) S.hl.classList.add('hl');
    if (opts.focus !== false && document.activeElement !== S.hl) {
      focusing = true;
      try { S.hl.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      focusing = false;
    }
    if (!opts.quiet) {
      const r = S.hl.getBoundingClientRect();
      if (r.top < 8 || r.bottom > innerHeight - 8) S.hl.scrollIntoView({ block: 'nearest' });
    }
  }

  function restoreHL(key) {
    if (!key) return;
    const el = document.querySelector('[data-k="' + key.replace(/"/g, '') + '"]');
    if (el && !el.disabled) setHL(el, { focus: false, quiet: true });
  }

  function navItems() {
    const root = S.overlay === 'pause' ? $('pause') : S.overlay === 'help' ? $('help') : document;
    return [...root.querySelectorAll('[data-nav]')].filter(el => !el.disabled && el.offsetParent !== null && !el.closest('[hidden]'));
  }

  function move(dx, dy) {
    const items = navItems();
    if (!items.length) return;
    if (!S.hl || items.indexOf(S.hl) < 0) { setHL(items[0]); return; }
    const a = S.hl.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    items.forEach(el => {
      if (el === S.hl) return;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const px = (x - ax) * dx + (y - ay) * dy;
      if (px <= 4) return;
      const ortho = Math.abs(dx ? y - ay : x - ax);
      const sc = px + ortho * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    });
    if (!best) {
      const i = items.indexOf(S.hl);
      const j = (dx + dy > 0) ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      best = items[j];
    }
    setHL(best);
  }

  function activateHL() {
    if (!S.hl || !S.hl.isConnected || S.hl.disabled) return;
    const act = S.hl.dataset.act;
    if (act === 'add') addToQueue(S.hl.dataset.id);
    else S.hl.click();
  }

  function favHL() {
    const id = highlightedSongId();
    if (id) toggleFav(id);
  }

  $('songList').addEventListener('click', e => {
    const fav = e.target.closest('[data-act="fav"]');
    if (fav) { toggleFav(fav.dataset.id); return; }
    const add = e.target.closest('[data-act="add"]');
    if (add) addToQueue(add.dataset.id);
  });
  $('queue').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const i = +btn.dataset.i;
    if (btn.dataset.act === 'jump') jump(i);
    else if (btn.dataset.act === 'up') { if (Queue.move(Q, i, -1)) { sfx.click(); renderQueue(); save(); } }
    else if (btn.dataset.act === 'down') { if (Queue.move(Q, i, 1)) { sfx.click(); renderQueue(); save(); } }
    else if (btn.dataset.act === 'rm') removeAt(i);
  });

  $('btnPlay').addEventListener('click', userPlayPause);
  $('btnNext').addEventListener('click', userNext);
  $('btnPrev').addEventListener('click', userPrev);
  $('btnShuffle').addEventListener('click', () => { Queue.setShuffle(Q, !Q.shuffle); sfx.click(); syncChrome(); save(); });
  $('btnRepeat').addEventListener('click', () => { Queue.cycleRepeat(Q); sfx.click(); syncChrome(); save(); });
  $('btnMute').addEventListener('click', () => {
    S.muted = !S.muted;
    player.mute(S.muted);
    sfx.setMuted(S.muted);
    syncChrome();
    save();
  });
  $('vol').addEventListener('input', e => {
    S.vol = +e.target.value;
    player.setVolume(S.vol);
    if (S.muted && S.vol > 0) { S.muted = false; player.mute(false); sfx.setMuted(false); }
    syncChrome();
    save();
  });
  $('btnClear').addEventListener('click', () => {
    if (!Q.queue.length) return;
    Q.queue = [];
    Q.index = -1;
    Q.bag = null;
    Q.history = [];
    player.pause();
    setMode('idle');
    setStatus('Queue cleared.');
    renderQueue();
    syncChrome();
    save();
  });
  $('btnHelp').addEventListener('click', () => openOverlay('help'));
  $('btnHelp2').addEventListener('click', () => openOverlay('help'));
  $('btnMenu').addEventListener('click', () => openOverlay('pause'));
  $('btnResume').addEventListener('click', () => closeOverlay(true));
  $('btnCloseHelp').addEventListener('click', () => closeOverlay(true));

  document.addEventListener('focusin', e => {
    if (focusing) return;
    const nav = e.target && e.target.closest && e.target.closest('[data-nav]');
    if (nav) setHL(nav, { focus: false, quiet: true });
  });

  document.addEventListener('keydown', e => {
    if (MS.isOpen && MS.isOpen()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('textarea, input[type="text"], [contenteditable]')) return;
    const onRange = t && t.id === 'vol';
    const k = e.key;
    if (onRange && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
    sfx.unlock();
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      move(k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0);
      return;
    }
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); if (!e.repeat) userPlayPause(); return; }
    if (k === 'Enter') { e.preventDefault(); if (!e.repeat) activateHL(); return; }
    if (k === 'Escape') { e.preventDefault(); if (S.overlay) closeOverlay(true); else openOverlay('pause'); return; }
    if (k === 'p' || k === 'P') { e.preventDefault(); openOverlay('pause'); return; }
    if (k === 'm' || k === 'M') { $('btnMute').click(); return; }
    if (k === 'n' || k === 'N') { e.preventDefault(); userNext(); return; }
    if (k === 's' || k === 'S') { $('btnShuffle').click(); return; }
    if (k === 'r' || k === 'R') { $('btnRepeat').click(); return; }
    if (k === 'f' || k === 'F') { favHL(); return; }
    if (k === 'v' || k === 'V') { cycleLook(); return; }
  });
  document.addEventListener('keyup', e => {
    if ((e.key === ' ' || e.key === 'Enter') && !(e.target && e.target.closest && e.target.closest('textarea, input[type="text"]'))) e.preventDefault();
  });

  const pad = { prev: {}, rep: 0, dir: null };
  function pollPad(dt) {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of gps) if (g && g.connected !== false) { gp = g; break; }
    if (!gp) return;
    const btn = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const edge = i => { const now = btn(i), was = !!pad.prev[i]; pad.prev[i] = now; return now && !was; };
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let dir = btn(14) || ax < -0.55 ? 'l' : btn(15) || ax > 0.55 ? 'r' : btn(12) || ay < -0.55 ? 'u' : btn(13) || ay > 0.55 ? 'd' : null;
    if (dir !== pad.dir) { pad.dir = dir; pad.rep = 0.38; if (dir) doDir(dir); }
    else if (dir) { pad.rep -= dt; if (pad.rep <= 0) { pad.rep = 0.16; doDir(dir); } }
    if (edge(0)) userPlayPause();
    if (edge(1) && S.overlay) closeOverlay(true);
    if (edge(2)) activateHL();
    if (edge(3)) favHL();
    if (edge(4)) userPrev();
    if (edge(5)) userNext();
    if (edge(9)) openOverlay('pause');
  }
  function doDir(d) { move(d === 'l' ? -1 : d === 'r' ? 1 : 0, d === 'u' ? -1 : d === 'd' ? 1 : 0); }

  MS.bindPause({
    pause() {
      S.stickerHeld = S.mode === 'playing' || S.mode === 'loading';
      if (S.stickerHeld) pausePlayback();
    },
    resume() {
      if (S.stickerHeld) { S.stickerHeld = false; resumePlayback(); }
    }
  });

  const LOOKS = (window.JukeViz && JukeViz.MODES) || ['cabinet', 'vinyl', 'spectrum'];
  let look = 'cabinet';
  try { const savedLook = store.getItem('jukebox.viz'); if (LOOKS.indexOf(savedLook) >= 0) look = savedLook; } catch (e) { /* ignore */ }
  function setLook(next) {
    look = LOOKS.indexOf(next) >= 0 ? next : 'cabinet';
    const panel = $('vizPanel');
    if (panel) {
      panel.dataset.look = look;
      panel.querySelectorAll('[data-viz]').forEach(b => b.setAttribute('aria-pressed', b.dataset.viz === look ? 'true' : 'false'));
    }
    try { store.setItem('jukebox.viz', look); } catch (e) { /* ignore */ }
  }
  function cycleLook() { setLook(LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length]); sfx.click(); }
  document.querySelectorAll('#vizPanel [data-viz]').forEach(b => b.addEventListener('click', () => setLook(b.dataset.viz)));
  if ($('vizNote') && window.JukeViz) $('vizNote').textContent = JukeViz.NOTE;

  let vizT = 0;
  let last = performance.now();
  function drawViz(dt) {
    const canvas = $('vizCanvas');
    if (!canvas || !window.JukeViz) return;
    let reduced = false;
    try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduced = false; }
    if (!reduced && (S.mode === 'playing' || S.mode === 'loading')) vizT += dt * 1000;
    JukeViz.draw(canvas, { t: vizT, mode: S.mode, decade: document.body.dataset.decade || 'all', reduced: reduced, dpr: window.devicePixelRatio || 1 });
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    pollPad(dt);
    drawViz(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setLook(look);

  fillPremium();
  renderTabs();
  renderSongs();
  renderQueue();
  syncChrome();
  setMode('idle');
  const firstSong = document.querySelector('.song');
  if (firstSong) { S.hl = firstSong; S.songPick = firstSong.dataset.id; }
  else S.hl = $('btnPlay');
  S.hlKey = S.hl ? (S.hl.dataset.k || '') : '';
  /* Real player only. The shell loads with the page so Play can start the song
     inside the click. Mock tests stay lazy so they still begin with no player. */
  if (!mock) player.ensure();

  window.JUKE = {
    S, Q, player, favorites: () => favorites.slice(),
    add: addToQueue, playPause: userPlayPause, next: userNext, prev: userPrev,
    removeAt, jump, toggleFav, setTab, openOverlay, closeOverlay, move, setHL
  };
})();
