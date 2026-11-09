/* JUKEBOX: 30-second iTunes previews and a visualizer driven by that audio.
   Nothing plays until Play. Previews are streamed, not saved. */
(function () {
  'use strict';
  const Cat = window.JukeCatalog;
  const Queue = window.JukeQueue;
  const $ = id => document.getElementById(id);
  const MS = window.MoodSticker || { event() {}, screen() {}, bindPause() {}, isOpen() { return false; } };
  const PAGE = 80;

  const store = (() => {
    try { localStorage.setItem('jukebox.t', '1'); localStorage.removeItem('jukebox.t'); return localStorage; }
    catch (e) {
      const m = {};
      return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
    }
  })();

  let songs = [];
  const byId = new Map();
  const engine = new window.JukeAudio.Engine();
  const sfx = new window.JukeSfx();
  let shown = PAGE;
  let look = 'spectrum';
  const LOOKS = (window.JukeViz && JukeViz.LOOKS) || ['spectrum', 'wave', 'radial', 'particles'];

  const S = {
    mode: 'idle',
    overlay: null,
    resumeAfter: false,
    stickerHeld: false,
    hl: null,
    hlKey: '',
    songPick: null,
    tab: 'all',
    vol: 85,
    muted: false,
    q: ''
  };

  function songById(id) { return byId.get(String(id)) || null; }
  function currentId() { return Queue.current(Q); }
  function currentSong() { const id = currentId(); return id ? songById(id) : null; }

  let Q = Queue.create();
  let favorites = [];

  function setStatus(text) { $('status').textContent = text || ''; }
  function setMode(mode) {
    S.mode = mode;
    document.body.dataset.mode = mode;
    document.body.dataset.screen = S.overlay || (mode === 'idle' ? 'listen' : 'play');
    const panel = $('vizPanel');
    if (panel) panel.dataset.state = mode;
    MS.screen(document.body.dataset.screen);
  }
  function themeDecade() {
    const song = currentSong();
    if (song) return song.decade;
    if (S.tab === '70s' || S.tab === '80s' || S.tab === '90s') return S.tab;
    return 'all';
  }
  function save() {
    try {
      store.setItem('jukebox.prefs', JSON.stringify(Queue.serialize(Q, {
        favorites, volume: S.vol, muted: S.muted, decade: S.tab
      })));
    } catch (e) { /* ignore */ }
  }

  function freshPreview(song) {
    return fetch('https://itunes.apple.com/lookup?id=' + encodeURIComponent(song.id))
      .then(r => r.json())
      .then(j => {
        const p = j.results && j.results[0] && j.results[0].previewUrl;
        return (p && String(p).indexOf('https://') === 0) ? p : song.preview;
      })
      .catch(() => song.preview);
  }

  let playToken = 0;
  function begin(song, refreshed) {
    if (!song) { setStatus('Add a song, then press Play.'); return; }
    const token = ++playToken;
    setMode('loading');
    setStatus('Loading the 30-second preview…');
    syncChrome();
    engine.playUrl(song.preview).then(() => {
      if (token !== playToken) return;
      setMode('playing');
      setStatus('');
      MS.event('start');
      syncChrome();
    }).catch(() => {
      if (token !== playToken) return;
      if (refreshed) { skipBroken(song); return; }
      freshPreview(song).then(url => {
        if (token !== playToken) return;
        if (!url || url === song.preview) { skipBroken(song); return; }
        song.preview = url;
        begin(song, true);
      });
    });
  }

  function skipBroken(song) {
    setStatus((song ? song.title : 'That preview') + ' will not play. Trying the next one.');
    const nxt = Queue.next(Q, { force: true });
    save();
    renderQueue();
    if (!nxt) { setMode('error'); syncChrome(); return; }
    begin(songById(nxt));
  }

  engine.audio.addEventListener('ended', () => {
    if (S.mode === 'idle') return;
    if (Q.repeat === 'one' && currentSong()) { begin(currentSong()); return; }
    const nxt = Queue.next(Q);
    save();
    if (!nxt) { setMode('ended'); setStatus('End of the queue.'); syncChrome(); renderQueue(); return; }
    begin(songById(nxt));
  });
  engine.audio.addEventListener('error', () => {
    if (S.mode === 'playing') skipBroken(currentSong());
  });

  function pausePlayback() {
    if (S.mode !== 'playing' && S.mode !== 'loading') return;
    engine.pause();
    setMode('paused');
    setStatus('Paused');
    syncChrome();
  }
  function resumePlayback() {
    const song = currentSong();
    if (!song) { beginFromIdle(); return; }
    if (!engine.audio.src) { begin(song); return; }
    setMode('loading');
    engine.resume().then(() => { setMode('playing'); setStatus(''); syncChrome(); }).catch(() => skipBroken(song));
  }

  function highlightedSongId() {
    const el = S.hl;
    if (el && el.dataset.id && (el.dataset.act === 'add' || el.dataset.act === 'fav')) return el.dataset.id;
    return S.songPick || null;
  }

  function beginFromIdle() {
    if (!Q.queue.length) {
      const id = highlightedSongId();
      if (id) Queue.add(Q, id);
    }
    if (!Q.queue.length) { setStatus('Add a song, then press Play.'); return; }
    if (Q.index < 0) Queue.start(Q);
    const song = currentSong();
    renderQueue();
    begin(song);
  }

  function userPlayPause() {
    if (MS.isOpen && MS.isOpen()) return;
    sfx.unlock();
    try { engine.unlock(); } catch (e) { /* resume on the play promise */ }
    if (S.overlay) { closeOverlay(true); return; }
    if (S.mode === 'playing') { pausePlayback(); return; }
    if (S.mode === 'paused') { resumePlayback(); return; }
    beginFromIdle();
  }

  function userNext() {
    sfx.unlock();
    const live = S.mode === 'playing' || S.mode === 'loading' || S.mode === 'paused';
    const id = Queue.next(Q, { force: true });
    save();
    renderQueue();
    if (!id) { setMode(Q.queue.length ? 'ended' : 'idle'); setStatus(Q.queue.length ? 'End of the queue.' : 'Queue is empty.'); engine.pause(); syncChrome(); return; }
    if (!live) { setStatus('Up next. Press Play.'); syncChrome(); return; }
    begin(songById(id));
  }
  function userPrev() {
    sfx.unlock();
    const live = S.mode === 'playing' || S.mode === 'paused' || S.mode === 'loading';
    if (live && engine.audio.currentTime > 3) { try { engine.audio.currentTime = 0; } catch (e) {} return; }
    const id = Queue.prev(Q);
    save();
    renderQueue();
    if (!id) return;
    if (!live) { syncChrome(); return; }
    begin(songById(id));
  }

  function addToQueue(id) {
    if (!songById(id)) return;
    Queue.add(Q, id);
    sfx.unlock(); sfx.click();
    renderQueue();
    save();
    if (S.mode === 'idle' || S.mode === 'ended') setStatus('Added. Press Play for the 30-second preview.');
    MS.event('big');
  }
  function removeAt(i) {
    const keep = S.mode === 'playing' || S.mode === 'loading';
    const res = Queue.removeAt(Q, i);
    if (!res.ok) return;
    renderQueue();
    save();
    if (!Q.queue.length) { engine.pause(); setMode('idle'); setStatus('Queue cleared.'); syncChrome(); return; }
    if (res.removedCurrent && keep) begin(currentSong());
    else syncChrome();
  }
  function jump(i) {
    const id = Queue.jump(Q, i);
    if (!id) return;
    sfx.unlock();
    begin(songById(id));
  }
  function toggleFav(id) {
    Queue.toggleFav(favorites, id);
    sfx.click();
    const favBtn = document.querySelector('[data-tab="fav"]');
    if (favBtn) favBtn.textContent = 'FAVES ' + favorites.length;
    if (S.tab === 'fav') renderSongs();
    else syncHearts();
    save();
  }
  function setTab(tab) {
    S.tab = tab;
    shown = PAGE;
    sfx.click();
    renderTabs();
    renderSongs();
    save();
    syncChrome();
  }

  function filtered() {
    return Cat.query(songs, { decade: S.tab, q: S.q, favs: new Set(favorites.map(String)) });
  }

  function renderTabs() {
    const host = $('tabs');
    host.innerHTML = '';
    const counts = { '70s': 0, '80s': 0, '90s': 0, all: songs.length, fav: favorites.length };
    songs.forEach(s => { counts[s.decade] = (counts[s.decade] || 0) + 1; });
    ['70s', '80s', '90s', 'all', 'fav'].forEach(tab => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.dataset.nav = '';
      b.dataset.k = 'tab:' + tab;
      b.dataset.tab = tab;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', tab === S.tab ? 'true' : 'false');
      const label = tab === 'all' ? 'ALL' : tab === 'fav' ? 'FAVES' : "'" + tab;
      b.textContent = label + ' ' + (counts[tab] || 0);
      b.addEventListener('click', () => setTab(tab));
      host.appendChild(b);
    });
    const list = filtered();
    $('crateNote').textContent = list.length + (S.q ? ' matches' : ' songs') + ' · 30-second previews';
  }

  function renderSongs() {
    const list = $('songList');
    const keep = S.hlKey;
    list.innerHTML = '';
    const rows = filtered();
    const slice = rows.slice(0, shown);
    $('btnMore').hidden = slice.length >= rows.length;
    if (!slice.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = S.tab === 'fav' ? 'No favorites yet.' : 'No songs match.';
      list.appendChild(p);
      return;
    }
    slice.forEach(song => {
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
      b.setAttribute('aria-label', 'Add ' + song.title + ' by ' + song.artist + ', 30-second preview');
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
      ar.textContent = song.artist + ' · 30s preview';
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
      heart.setAttribute('aria-label', 'Favorite ' + song.title);
      const store = document.createElement('a');
      store.className = 'mini-store';
      store.href = song.store;
      store.target = '_blank';
      store.rel = 'noopener noreferrer';
      store.textContent = 'iTunes';
      store.setAttribute('aria-label', 'View ' + song.title + ' in iTunes');
      li.append(b, heart, store);
      list.appendChild(li);
    });
    syncHearts();
    markCurrent();
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
      return;
    }
    Q.queue.forEach((id, i) => {
      const song = songById(id);
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
      const title = document.createElement('b');
      title.textContent = song.title;
      const sub = document.createElement('small');
      sub.textContent = song.artist + ' · 30s';
      b.append(title, sub);
      li.appendChild(b);
      [['up', 'Move up', '↑'], ['down', 'Move down', '↓'], ['rm', 'Remove', '✕']].forEach(spec => {
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
    const live = S.mode === 'playing' || S.mode === 'paused' || S.mode === 'loading';
    document.querySelectorAll('.strip').forEach(el => {
      const on = live && el.dataset.id === String(id);
      el.classList.toggle('is-current', on);
    });
    document.querySelectorAll('.qrow').forEach(el => {
      el.classList.toggle('is-current', String(Q.index) === el.dataset.i && Q.index >= 0);
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
    const live = S.mode === 'playing' || S.mode === 'paused' || S.mode === 'loading';
    $('npKicker').textContent = live ? 'NOW PLAYING' : (song ? 'UP NEXT' : 'JUKEBOX');
    $('npTitle').textContent = song ? song.title : 'Nothing queued';
    $('npMeta').textContent = song ? (song.artist + ' · ' + song.year) : 'Search a decade and add a hit';
    $('previewTag').hidden = !song;
    const link = $('storeLink');
    if (song) { link.href = song.store; link.hidden = false; }
    else { link.href = 'https://music.apple.com/'; }
    const art = $('art');
    if (song && song.artwork) { art.hidden = false; art.src = song.artwork; art.alt = ''; }
    else art.hidden = true;
    const playing = S.mode === 'playing';
    $('btnPlay').textContent = playing ? 'PAUSE' : 'PLAY';
    $('btnPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('btnShuffle').setAttribute('aria-pressed', Q.shuffle ? 'true' : 'false');
    $('btnRepeat').textContent = Q.repeat === 'all' ? 'REPEAT ALL' : Q.repeat === 'one' ? 'REPEAT ONE' : 'REPEAT';
    $('btnRepeat').setAttribute('aria-pressed', Q.repeat === 'off' ? 'false' : 'true');
    $('btnMute').textContent = S.muted ? 'UNMUTE' : 'MUTE';
    $('btnMute').setAttribute('aria-pressed', S.muted ? 'true' : 'false');
    if (document.activeElement !== $('vol')) $('vol').value = String(S.vol);
    markCurrent();
  }

  function openOverlay(name) {
    if (S.overlay === name) { closeOverlay(true); return; }
    const carry = S.resumeAfter || S.mode === 'playing' || S.mode === 'loading';
    if (S.overlay) { S.overlay = null; $('pause').hidden = true; $('help').hidden = true; }
    S.resumeAfter = carry;
    if (S.mode === 'playing' || S.mode === 'loading') pausePlayback();
    S.overlay = name;
    $('pause').hidden = name !== 'pause';
    $('help').hidden = name !== 'help';
    $('cabinet').inert = true;
    document.body.dataset.screen = name;
    MS.screen(name);
    setHL(name === 'pause' ? $('btnResume') : $('btnCloseHelp'), { quiet: true });
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
  }

  let focusing = false;
  function setHL(el, opts) {
    opts = opts || {};
    if (S.hl) S.hl.classList.remove('hl');
    S.hl = el || null;
    if (!S.hl) return;
    S.hlKey = S.hl.dataset.k || '';
    if (S.hl.dataset.id && (S.hl.dataset.act === 'add' || S.hl.dataset.act === 'fav')) S.songPick = S.hl.dataset.id;
    if (opts.show !== false) S.hl.classList.add('hl');
    if (opts.focus !== false && document.activeElement !== S.hl) {
      focusing = true;
      try { S.hl.focus({ preventScroll: true }); } catch (e) {}
      focusing = false;
    }
    if (!opts.quiet) {
      const r = S.hl.getBoundingClientRect();
      if (r.top < 8 || r.bottom > innerHeight - 8) S.hl.scrollIntoView({ block: 'nearest' });
    }
  }
  function restoreHL(key) {
    if (!key) return;
    const el = document.querySelector('[data-k="' + String(key).replace(/"/g, '') + '"]');
    if (el && !el.disabled) setHL(el, { focus: false, quiet: true });
  }
  function navItems() {
    const rootEl = S.overlay === 'pause' ? $('pause') : S.overlay === 'help' ? $('help') : document;
    return [...rootEl.querySelectorAll('[data-nav]')].filter(el => !el.disabled && el.offsetParent !== null && !el.closest('[hidden]'));
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
      const sc = px + Math.abs(dx ? y - ay : x - ax) * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    });
    if (!best) {
      const i = items.indexOf(S.hl);
      best = items[(dx + dy > 0) ? (i + 1) % items.length : (i - 1 + items.length) % items.length];
    }
    setHL(best);
  }
  function activateHL() {
    if (!S.hl || !S.hl.isConnected || S.hl.disabled) return;
    if (S.hl.dataset.act === 'add') addToQueue(S.hl.dataset.id);
    else S.hl.click();
  }
  function favHL() { const id = highlightedSongId(); if (id) toggleFav(id); }

  function boot(doc) {
    songs = Cat.prepare(doc.songs || []);
    songs.forEach(s => byId.set(String(s.id), s));
    const valid = new Set(songs.map(s => String(s.id)));
    let saved = {};
    try { saved = JSON.parse(store.getItem('jukebox.prefs') || '{}') || {}; } catch (e) { saved = {}; }
    const restored = Queue.restore(saved, valid);
    Q = restored.state;
    favorites = restored.favorites;
    S.tab = restored.decade;
    S.vol = restored.volume;
    S.muted = restored.muted;
    engine.setVolume(S.vol / 100);
    engine.setMuted(S.muted);
    try { const v = store.getItem('jukebox.viz'); if (LOOKS.indexOf(v) >= 0) look = v; } catch (e) {}
    $('courtesy').textContent = Cat.COURTESY;
    $('vizNote').textContent = 'Drawn from the preview that is playing.';
    $('helpCourtesy').textContent = Cat.COURTESY + ' ' + (doc.storeNote || '');
    renderTabs();
    renderSongs();
    renderQueue();
    syncChrome();
    setMode('idle');
    setLook(look);
    const first = document.querySelector('.song');
    if (first) { S.hl = first; S.songPick = first.dataset.id; S.hlKey = first.dataset.k; }
    window.JUKE = {
      S, get Q() { return Q; }, songs: () => songs, engine, byId: songById,
      add: addToQueue, playPause: userPlayPause, next: userNext
    };
  }

  function setLook(next) {
    look = LOOKS.indexOf(next) >= 0 ? next : 'spectrum';
    const panel = $('vizPanel');
    if (panel) {
      panel.dataset.look = look;
      panel.querySelectorAll('[data-viz]').forEach(b => b.setAttribute('aria-pressed', b.dataset.viz === look ? 'true' : 'false'));
    }
    try { store.setItem('jukebox.viz', look); } catch (e) {}
  }
  function cycleLook() { setLook(LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length]); sfx.click(); }

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
    else if (btn.dataset.act === 'up' && Queue.move(Q, i, -1)) { renderQueue(); save(); }
    else if (btn.dataset.act === 'down' && Queue.move(Q, i, 1)) { renderQueue(); save(); }
    else if (btn.dataset.act === 'rm') removeAt(i);
  });
  $('btnPlay').addEventListener('click', userPlayPause);
  $('btnNext').addEventListener('click', userNext);
  $('btnPrev').addEventListener('click', userPrev);
  $('btnShuffle').addEventListener('click', () => { Queue.setShuffle(Q, !Q.shuffle); syncChrome(); save(); });
  $('btnRepeat').addEventListener('click', () => { Queue.cycleRepeat(Q); syncChrome(); save(); });
  $('btnMute').addEventListener('click', () => { S.muted = !S.muted; engine.setMuted(S.muted); sfx.setMuted(S.muted); syncChrome(); save(); });
  $('vol').addEventListener('input', e => { S.vol = +e.target.value; engine.setVolume(S.vol / 100); if (S.muted && S.vol > 0) { S.muted = false; engine.setMuted(false); } syncChrome(); save(); });
  $('btnClear').addEventListener('click', () => { Q.queue = []; Q.index = -1; Q.bag = null; Q.history = []; engine.pause(); setMode('idle'); setStatus('Queue cleared.'); renderQueue(); syncChrome(); save(); });
  $('btnMore').addEventListener('click', () => { shown += PAGE; renderSongs(); });
  $('q').addEventListener('input', () => { S.q = $('q').value; shown = PAGE; renderTabs(); renderSongs(); });
  $('btnHelp').addEventListener('click', () => openOverlay('help'));
  $('btnHelp2').addEventListener('click', () => openOverlay('help'));
  $('btnMenu').addEventListener('click', () => openOverlay('pause'));
  $('btnResume').addEventListener('click', () => closeOverlay(true));
  $('btnCloseHelp').addEventListener('click', () => closeOverlay(true));
  document.querySelectorAll('#vizPanel [data-viz]').forEach(b => b.addEventListener('click', () => { setLook(b.dataset.viz); sfx.click(); }));

  document.addEventListener('focusin', e => {
    if (focusing) return;
    const nav = e.target && e.target.closest && e.target.closest('[data-nav]');
    if (nav) setHL(nav, { focus: false, quiet: true });
  });
  document.addEventListener('keydown', e => {
    if (MS.isOpen && MS.isOpen()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('textarea, input[type="text"], input[type="search"], [contenteditable]')) return;
    const onRange = t && t.id === 'vol';
    const k = e.key;
    if (onRange && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
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
    pause() { S.stickerHeld = S.mode === 'playing'; if (S.stickerHeld) pausePlayback(); },
    resume() { if (S.stickerHeld) { S.stickerHeld = false; resumePlayback(); } }
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollPad(dt);
    const canvas = $('vizCanvas');
    if (canvas && window.JukeViz && songs.length) {
      let reduced = false;
      try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
      const sample = engine.sample();
      JukeViz.draw(canvas, {
        freq: sample.freq, wave: sample.wave, playing: S.mode === 'playing',
        look: look, decade: document.body.dataset.decade || 'all', reduced: reduced,
        dpr: Math.min(2, window.devicePixelRatio || 1)
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  fetch('data/catalog.json').then(r => r.json()).then(boot).catch(() => {
    setStatus('The song list did not load.');
  });
})();
