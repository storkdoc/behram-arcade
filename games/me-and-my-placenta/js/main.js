/* Me & My Placenta — a listening room.
   Space plays and pauses the narration. Enter goes to the next chapter.
   Nursery music stays under the voice and lifts a little between chapters. */
(function () {
  'use strict';

  const AMAZON = 'https://www.amazon.com/s?k=steve+behram&crid=HGRQYCNCX1JN&sprefix=steve+behram%2Caps%2C79&ref=nb_sb_noss_1';
  const STORE = 'placenta.place';
  const qs = new URLSearchParams(location.search);
  const FAST = qs.get('fast') === '1';
  const CUE_SCALE = FAST ? 28 : 1;

  const $ = function (id) { return document.getElementById(id); };

  const canvas = $('sky');
  const stage = new window.PlacentaStage(canvas);
  const music = new window.PlacentaMusic(Math.random);
  let mode = 'title';
  const play = new window.PlacentaPlay(stage, {
    fast: FAST,
    onEnd: function () { finishPlay(); },
    onLine: function (text) { setPlayLine(text); },
    onCoach: function (how, line) { setCoach(how, line); },
    onHelp: function (on) { show('play-assist', !!on); }
  });
  const narration = new Audio();
  narration.preload = 'auto';
  narration.setAttribute('playsinline', '');
  narration.setAttribute('webkit-playsinline', '');
  document.body.appendChild(narration);

  let chapters = [];
  let index = 0;
  let started = false;
  let cueIndex = -1;
  let carried = { art: 'cover', doctor: 0, globe: 0, curtain: 1, mood: 'calm' };
  let narrVol = 1;
  let narrMuted = false;
  let narrRate = 1;
  const ADHD = [
    { v: 1, name: 'Focused' },
    { v: 1.25, name: 'Mild' },
    { v: 1.5, name: 'Moderate' },
    { v: 1.75, name: 'Severe' },
    { v: 2, name: 'Squirrel!' }
  ];
  let saveAt = 0;
  let endShown = false;

  const keys = ['cover', 'nebula', 'placy', 'globe', 'shell', 'curled', 'hug', 'cheek', 'fishbowl', 'drop', 'cap', 'uterus', 'birth', 'manatee', 'stage', 'bag', 'singing', 'toddler', 'pointing', 'ovum', 'nest', 'astronaut', 'earth', 'planets', 'orbs', 'doctor'];
  (window.PlacentaStage.poses || []).forEach(function (name) { keys.push('doctor-' + name); });
  for (let n = 1; n <= 23; n++) keys.push('sb' + (n < 10 ? '0' : '') + n);

  function mood(name) {
    if (window.MoodSticker && MoodSticker.screen) MoodSticker.screen(name);
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function saveStore() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        id: chapters[index] ? chapters[index].id : 'opening',
        time: narration.currentTime || 0,
        musicVol: music.volume,
        narrVol: narrVol,
        musicMuted: music.muted,
        narrMuted: narrMuted,
        rate: narrRate
      }));
    } catch (e) {}
  }

  function snapRate(n) {
    let best = ADHD[0];
    let gap = 99;
    const x = Number(n);
    for (let i = 0; i < ADHD.length; i++) {
      const d = Math.abs(ADHD[i].v - x);
      if (d < gap) { gap = d; best = ADHD[i]; }
    }
    return best;
  }

  function applyNarrationGain() {
    try { narration.volume = narrMuted ? 0 : narrVol; } catch (e) {}
    narration.muted = false;
    const step = snapRate(narrRate);
    narrRate = step.v;
    try {
      narration.playbackRate = narrRate;
      narration.preservesPitch = true;
      narration.webkitPreservesPitch = true;
    } catch (e) {}
    const slider = $('adhd');
    if (slider && slider.value !== String(narrRate)) slider.value = String(narrRate);
    if (slider) slider.setAttribute('aria-valuetext', narrRate + 'x ' + step.name);
    const marks = document.querySelectorAll('.adhd-marks [data-rate]');
    for (let i = 0; i < marks.length; i++) {
      const on = Math.abs(Number(marks[i].getAttribute('data-rate')) - narrRate) < 0.01;
      marks[i].classList.toggle('is-on', on);
    }
    const now = $('adhd-now');
    if (now) now.textContent = narrRate + 'x ' + step.name;
  }

  /* Call from the tap itself. Opens playback even when the iPhone ringer is silent,
     and does not attach the narration or the lullabies to the context. */
  function unlockAudio() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {}
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!unlockAudio.ctx) unlockAudio.ctx = new AC();
      const ctx = unlockAudio.ctx;
      if (ctx.state !== 'running') {
        const r = ctx.resume();
        if (r && r.catch) r.catch(function () {});
      }
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {}
  }

  function duck() {
    const speaking = started && !narration.paused && !narrMuted && narrVol > 0.01 && !endShown;
    music.setDuck(speaking ? 0.26 : 0.7);
    return speaking;
  }

  function chapter() { return chapters[index] || null; }

  function storyTime() {
    const t = narration.currentTime || 0;
    const ch = chapter();
    if (ch && ch.id === 'grand') return t * CUE_SCALE;
    return t;
  }

  function applyCue() {
    const ch = chapter();
    if (!ch || !ch.cues || !ch.cues.length) return;
    const t = storyTime();
    let i = -1;
    for (let k = 0; k < ch.cues.length; k++) if (ch.cues[k].t <= t + 0.02) i = k;
    if (i < 0 || i === cueIndex) return;
    cueIndex = i;
    const cue = ch.cues[i];
    carried = {
      art: cue.art || carried.art,
      doctor: typeof cue.doctor === 'number' ? cue.doctor : carried.doctor,
      globe: typeof cue.globe === 'number' ? cue.globe : carried.globe,
      curtain: typeof cue.curtain === 'number' ? cue.curtain : carried.curtain,
      mood: cue.mood || carried.mood,
      doctorPose: cue.doctorPose || null
    };
    stage.set({
      art: carried.art,
      doctor: carried.doctor,
      doctorPose: carried.doctorPose,
      globe: carried.globe,
      curtain: carried.curtain,
      mood: carried.mood,
      fast: FAST
    });
  }

  function show(id, on) {
    const el = $(id);
    if (!el) return;
    if (on) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }

  function renderList() {
    const ol = $('chapters');
    ol.innerHTML = '';
    chapters.forEach(function (ch, i) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chapter' + (i === index && started ? ' is-on' : '');
      b.innerHTML = '<span class="k">' + (ch.kicker || '') + '</span><span class="n">' + ch.title + '</span>';
      b.addEventListener('click', function () {
        ensure();
        playChapter(i, 0);
        show('list', false);
      });
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  function setCaption() {
    const ch = chapter();
    const cap = $('caption');
    if (!ch) return;
    cap.innerHTML = '<span>' + (ch.kicker || '') + '</span> ' + ch.title;
    cap.classList.remove('fade');
    void cap.offsetWidth;
    cap.classList.add('show');
    clearTimeout(setCaption._t);
    setCaption._t = setTimeout(function () { cap.classList.add('fade'); }, FAST ? 700 : 5200);
  }

  function syncUi() {
    const playing = started && !narration.paused && !endShown;
    const btn = $('play');
    btn.textContent = playing ? 'Pause' : 'Play';
    btn.setAttribute('aria-label', playing ? 'Pause narration' : 'Play narration');
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    $('music-mute').textContent = music.muted ? 'Music off' : 'Music';
    $('music-mute').setAttribute('aria-pressed', music.muted ? 'true' : 'false');
    $('voice-mute').textContent = narrMuted ? 'Voice off' : 'Voice';
    $('voice-mute').setAttribute('aria-pressed', narrMuted ? 'true' : 'false');
    const ch = chapter();
    $('now').textContent = ch ? ((ch.kicker ? ch.kicker + ' · ' : '') + ch.title) : '';
    const dur = narration.duration;
    const bar = $('bar');
    if (dur && isFinite(dur)) bar.value = String(narration.currentTime / dur);
    const credit = $('music-line');
    if (credit && !credit.hidden) fillCredit();
  }

  function fillCredit() {
    const t = music.track;
    const box = $('music-credit');
    if (!t) { box.textContent = ''; return; }
    box.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = t.composer + ' — ' + t.piece;
    const q = document.createElement('p');
    q.textContent = t.performer + ' · ' + t.license;
    const a = document.createElement('a');
    a.href = t.page;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Source';
    box.appendChild(p);
    box.appendChild(q);
    box.appendChild(a);
  }

  function playChapter(i, time) {
    if (!chapters.length) {
      narration.src = 'audio/clip-04-12sec.mp3';
      narration.setAttribute('playsinline', '');
      narration.setAttribute('webkit-playsinline', '');
      applyNarrationGain();
      const early = narration.play();
      if (early && early.catch) early.catch(function () {});
      music.keepAlive();
      return;
    }
    index = (i + chapters.length) % chapters.length;
    endShown = false;
    show('end', false);
    show('story', true);
    show('title', false);
    const ch = chapter();
    cueIndex = -1;
    carried = { art: 'cover', doctor: 0, globe: 0, curtain: 1, mood: 'calm', doctorPose: null };
    narration.src = 'audio/' + ch.file;
    narration.setAttribute('playsinline', '');
    narration.setAttribute('webkit-playsinline', '');
    applyNarrationGain();
    /* play() has to run in this same turn as the tap. Waiting for
       loadedmetadata makes Safari ignore it. The lullaby is asked to
       keep going in this same turn, in case the swap paused it. */
    const startedPlay = narration.play();
    if (startedPlay && startedPlay.catch) startedPlay.catch(function () {});
    music.keepAlive();
    const startAt = function () {
      const want = time || 0;
      const place = function () {
        if (want < 0.35) return true;
        const end = narration.seekable.length ? narration.seekable.end(narration.seekable.length - 1) : 0;
        if (end < want) return false;
        try { narration.currentTime = Math.min(want, Math.max(0, narration.duration - 0.2)); } catch (e) { return false; }
        return true;
      };
      if (!place()) {
        const again = function () {
          if (place()) {
            narration.removeEventListener('progress', again);
            narration.removeEventListener('canplay', again);
          }
        };
        narration.addEventListener('progress', again);
        narration.addEventListener('canplay', again);
      }
      applyCue();
      setCaption();
      renderList();
      syncUi();
      saveStore();
      mood('play');
    };
    if (narration.readyState >= 1) startAt();
    else narration.addEventListener('loadedmetadata', startAt, { once: true });
  }

  function ensure() {
    if (started) return;
    started = true;
    music.start();
    show('title', false);
    show('story', true);
    mood('play');
    duck();
  }

  function begin() {
    unlockAudio();
    if (mode === 'play') play.stop();
    mode = 'listen';
    show('play-hud', false);
    show('paused', false);
    ensure();
    if (!narration.paused && narration.src) return;
    const saved = FAST ? null : loadStore();
    let i = 0;
    let t = 0;
    if (FAST) {
      i = Math.max(0, chapters.findIndex(function (c) { return c.id === 'grand'; }));
    } else if (saved) {
      const found = chapters.findIndex(function (c) { return c.id === saved.id; });
      if (found >= 0) { i = found; t = saved.time || 0; }
    }
    playChapter(i, t);
  }

  function toggle() {
    if (!started || !narration.src) { begin(); return; }
    if (endShown) { playChapter(0, 0); return; }
    if (narration.paused) {
      const p = narration.play();
      if (p && p.catch) p.catch(function () {});
      music.keepAlive();
    } else narration.pause();
    duck();
    syncUi();
    saveStore();
  }

  function nextChapter() {
    if (!started) { begin(); return; }
    if (index >= chapters.length - 1) { showEnd(); return; }
    playChapter(index + 1, 0);
  }
  function prevChapter() {
    if (!started) { begin(); return; }
    playChapter(index - 1, 0);
  }

  function showEnd() {
    endShown = true;
    mode = 'end';
    show('end', true);
    show('list', false);
    show('play-hud', false);
    show('paused', false);
    $('end-title').textContent = 'Placy lives on';
    $('end-note').textContent = 'The rest of Cletus and Placy is in the book.';
    $('again').textContent = 'Listen again';
    show('listen-end', false);
    show('end-chapters', true);
    duck();
    syncUi();
    mood('end');
    if (window.MoodSticker && MoodSticker.event) MoodSticker.event('big');
  }

  function setPlayLine(text) {
    const el = $('play-line');
    if (el) el.textContent = text || '';
  }

  function setCoach(how, line) {
    const banner = $('play-banner');
    const hint = $('play-coach-line');
    if (banner) {
      banner.textContent = how || '';
      banner.classList.remove('is-quiet');
    }
    if (hint) hint.textContent = how || '';
    setPlayLine(line);
  }

  function openHowto() {
    if (mode !== 'play') return;
    if (play.active) play.paused = true;
    show('paused', false);
    show('howto', true);
  }

  function closeHowto() {
    show('howto', false);
    if (!play.active) {
      show('play-hud', true);
      show('paused', false);
      play.start();
    } else {
      play.paused = false;
      show('paused', false);
    }
  }

  function startPlay() {
    unlockAudio();
    if (narration.src) { narration.pause(); }
    started = false;
    endShown = false;
    mode = 'play';
    show('title', false);
    show('story', false);
    show('end', false);
    show('list', false);
    show('paused', false);
    show('play-hud', false);
    show('play-assist', false);
    music.start();
    music.keepAlive();
    show('howto', true);
    mood('play');
  }

  function finishPlay() {
    mode = 'end';
    endShown = true;
    play.stop();
    show('play-hud', false);
    show('paused', false);
    show('howto', false);
    show('play-assist', false);
    show('end', true);
    $('end-title').textContent = 'Placy lives on';
    $('end-note').textContent = 'The story keeps going in the book.';
    $('again').textContent = 'Play again';
    show('listen-end', true);
    show('end-chapters', false);
    if (window.MoodSticker && MoodSticker.event) MoodSticker.event('big');
    mood('end');
  }

  function leavePlay() {
    play.stop();
    mode = 'title';
    show('play-hud', false);
    show('paused', false);
    show('howto', false);
    show('play-assist', false);
    show('title', true);
    show('story', false);
    show('end', false);
    mood('title');
  }

  function escPlay() {
    if (!$('howto').hasAttribute('hidden')) {
      if (!play.active) leavePlay();
      else {
        show('howto', false);
        show('paused', true);
      }
      return true;
    }
    if (!play.active && mode !== 'play') return false;
    if (!play.active) { leavePlay(); return true; }
    if (!play.paused) {
      play.paused = true;
      show('paused', true);
      return true;
    }
    leavePlay();
    return true;
  }

  narration.addEventListener('timeupdate', function () {
    applyCue();
    const dur = narration.duration;
    if (dur && isFinite(dur)) $('bar').value = String((narration.currentTime || 0) / dur);
    const now = performance.now();
    if (now - saveAt > 2000) { saveAt = now; saveStore(); }
  });
  narration.addEventListener('ended', function () {
    saveStore();
    if (index >= chapters.length - 1) showEnd();
    else {
      duck();
      setTimeout(function () { if (!endShown) playChapter(index + 1, 0); }, FAST ? 180 : 1400);
    }
  });
  narration.addEventListener('play', function () { duck(); syncUi(); });
  narration.addEventListener('pause', function () { duck(); syncUi(); saveStore(); });

  $('bar').addEventListener('input', function () {
    const dur = narration.duration;
    if (!dur || !isFinite(dur)) return;
    ensure();
    narration.currentTime = Number($('bar').value) * dur;
    cueIndex = -1;
    applyCue();
  });

  function onKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (!$('howto').hasAttribute('hidden')) {
      if (e.code === 'Escape') { e.preventDefault(); escPlay(); }
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); closeHowto(); }
      return;
    }
    const steer = e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyW' || e.code === 'KeyS';
    if (e.code === 'Space' || e.code === 'Enter' || steer) e.preventDefault();
    if (mode === 'play') {
      if (e.code === 'Escape') {
        if (e.repeat) return;
        escPlay();
        return;
      }
      if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) return;
      play.key(e.code, true);
      return;
    }
    if (e.repeat) return;
    if (!$('title').hasAttribute('hidden')) {
      if (e.code === 'Space') startPlay();
      else if (e.code === 'Enter') begin();
      return;
    }
    if (e.code === 'Space') toggle();
    else if (e.code === 'Enter') nextChapter();
    else if (e.code === 'ArrowRight') nextChapter();
    else if (e.code === 'ArrowLeft') prevChapter();
    else if (e.code === 'KeyM') { ensure(); music.toggleMuted(); syncUi(); saveStore(); }
    else if (e.code === 'KeyN') { narrMuted = !narrMuted; applyNarrationGain(); duck(); syncUi(); saveStore(); }
    else if (e.code === 'KeyC') show('list', $('list').hasAttribute('hidden'));
    else if (e.code === 'Escape') {
      if (!$('qr-box').hasAttribute('hidden')) show('qr-box', false);
      else if (!$('list').hasAttribute('hidden')) show('list', false);
      else if (started && !narration.paused) { narration.pause(); syncUi(); }
    }
  }
  function onKeyUp(e) {
    if (mode === 'play') play.key(e.code, false);
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', function () { play.held = {}; });

  $('play-game').addEventListener('click', function (e) { e.stopPropagation(); startPlay(); });
  $('howto-ok').addEventListener('click', function (e) { e.stopPropagation(); closeHowto(); });
  $('howto-btn').addEventListener('click', function (e) { e.stopPropagation(); openHowto(); });
  $('listen').addEventListener('click', function (e) { e.stopPropagation(); begin(); });
  $('listen-end').addEventListener('click', function () { show('end', false); endShown = false; begin(); });
  $('act').addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    play.buttonHold = true;
    play.action();
  });
  $('act').addEventListener('pointerup', function () { play.buttonHold = false; });
  $('act').addEventListener('pointercancel', function () { play.buttonHold = false; });
  $('act').addEventListener('pointerleave', function () { play.buttonHold = false; });
  $('act').addEventListener('click', function (e) {
    e.stopPropagation();
    if (e.detail === 0) play.action();
  });
  $('pause-btn').addEventListener('click', function (e) { e.stopPropagation(); escPlay(); });
  $('paused').addEventListener('click', function () { escPlay(); });
  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'play' || play.paused) return;
    document.body.classList.add('touch');
    const r = canvas.getBoundingClientRect();
    play.pointerDown((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (mode !== 'play' || !play._down) return;
    const r = canvas.getBoundingClientRect();
    play.pointerMove((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  canvas.addEventListener('pointerup', function (e) {
    if (mode !== 'play') return;
    const r = canvas.getBoundingClientRect();
    play.pointerUp((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  $('play').addEventListener('click', function () { toggle(); });
  $('next').addEventListener('click', function () { nextChapter(); });
  $('prev').addEventListener('click', function () { prevChapter(); });
  $('chapters-btn').addEventListener('click', function () { show('list', $('list').hasAttribute('hidden')); });
  $('list-close').addEventListener('click', function () { show('list', false); });
  $('music-mute').addEventListener('click', function () { ensure(); music.toggleMuted(); syncUi(); saveStore(); });
  $('voice-mute').addEventListener('click', function () { narrMuted = !narrMuted; applyNarrationGain(); duck(); syncUi(); saveStore(); });
  $('music-vol').addEventListener('input', function () {
    ensure();
    music.setVolume(Number($('music-vol').value));
    saveStore();
  });
  $('voice-vol').addEventListener('input', function () {
    narrVol = Number($('voice-vol').value);
    applyNarrationGain();
    duck();
    saveStore();
  });
  $('adhd').addEventListener('input', function () {
    narrRate = snapRate($('adhd').value).v;
    applyNarrationGain();
    saveStore();
  });
  $('adhd').addEventListener('change', function () {
    narrRate = snapRate($('adhd').value).v;
    applyNarrationGain();
    saveStore();
  });
  document.querySelectorAll('.adhd-marks [data-rate]').forEach(function (mark) {
    mark.addEventListener('click', function () {
      narrRate = snapRate(mark.getAttribute('data-rate')).v;
      applyNarrationGain();
      saveStore();
    });
  });
  $('music-note').addEventListener('click', function () {
    const line = $('music-line');
    const open = line.hasAttribute('hidden');
    show('music-line', open);
    if (open) fillCredit();
    $('music-note').setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('[data-qr]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      show('qr-box', true);
    });
  });
  $('qr-box').addEventListener('click', function () { show('qr-box', false); });
  $('again').addEventListener('click', function () {
    show('end', false);
    endShown = false;
    if ($('again').textContent.indexOf('Play') === 0) startPlay();
    else playChapter(0, 0);
  });
  $('end-chapters').addEventListener('click', function () { show('list', true); });

  const gpWas = { a: false, x: false, lb: false, rb: false, start: false };
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (let i = 0; i < (pads ? pads.length : 0); i++) if (pads[i] && pads[i].connected) pad = pads[i];
    if (!pad) return;
    const pressed = function (n) { return !!(pad.buttons[n] && pad.buttons[n].pressed); };
    const a = pressed(0);
    const x = pressed(2);
    const lb = pressed(4);
    const rb = pressed(5);
    const start = pressed(9);
    if (mode === 'play') {
      if (start && !gpWas.start) escPlay();
      gpWas.a = a; gpWas.x = x; gpWas.lb = lb; gpWas.rb = rb; gpWas.start = start;
      return;
    }
    if (a && !gpWas.a) {
      if (!$('title').hasAttribute('hidden')) startPlay();
      else toggle();
    }
    if ((x && !gpWas.x) || (rb && !gpWas.rb)) {
      if (!$('title').hasAttribute('hidden')) begin();
      else nextChapter();
    }
    if (lb && !gpWas.lb && $('title').hasAttribute('hidden')) prevChapter();
    if (start && !gpWas.start) { ensure(); music.toggleMuted(); syncUi(); saveStore(); }
    gpWas.a = a; gpWas.x = x; gpWas.lb = lb; gpWas.rb = rb; gpWas.start = start;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollPad();
    music.tick();
    if (mode === 'play') play.tick(dt);
    else if (started && narration.src) applyCue();
    duck();
    stage.tick(dt);
    stage.draw();
    if (mode === 'play') {
      play.draw(stage.ctx);
      const bar = $('journey-bar');
      if (bar) bar.style.width = (play.fraction() * 100) + '%';
      const banner = $('play-banner');
      if (banner && play.active) banner.classList.toggle('is-quiet', play.t >= (play.bannerUntil || 0));
      const ring = $('act-ring');
      const act = $('act');
      if (ring && act && play.active) {
        const circ = 97.4;
        const u = Math.max(0, Math.min(1, play.inner()));
        ring.style.strokeDashoffset = String(circ * (1 - u));
        act.classList.toggle('is-open', !!play.cueOpen);
      }
    }
    requestAnimationFrame(frame);
  }

  function bootSaved() {
    const saved = loadStore();
    if (!saved || FAST) return;
    if (typeof saved.musicVol === 'number') music.setVolume(saved.musicVol);
    if (typeof saved.narrVol === 'number') narrVol = saved.narrVol;
    if (typeof saved.rate === 'number') narrRate = snapRate(saved.rate).v;
    music.setMuted(!!saved.musicMuted);
    narrMuted = !!saved.narrMuted;
    $('music-vol').value = String(music.volume);
    $('voice-vol').value = String(narrVol);
    applyNarrationGain();
  }

  stage.resize();
  window.addEventListener('resize', function () { stage.resize(); });

  const ready = Promise.all([
    stage.load(keys),
    fetch('audio/manifest.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    chapters = (res[1] && res[1].chapters) || [];
    bootSaved();
    renderList();
    syncUi();
    mood('title');
    stage.resize();
    stage.draw();
  });

  requestAnimationFrame(frame);

  window.PLACENTA = {
    amazon: AMAZON,
    fast: FAST,
    ready: ready,
    narration: narration,
    musicElement: function () { return music.element(); },
    musicLine: function () { return music.line(); },
    trackCount: function () { return music.tracks.length; },
    get art() { return stage.artKey; },
    get chapterId() { return chapter() ? chapter().id : ''; },
    get ducked() { return music.duck < 0.45; },
    get narrRate() { return narration.playbackRate; },
    get pose() { return stage.pose; },
    get curtain() { return stage.curtain; },
    get globe() { return stage.globe; },
    playChapter: function (id) {
      ensure();
      const i = chapters.findIndex(function (c) { return c.id === id; });
      if (i >= 0) playChapter(i, 0);
    },
    get mode() { return mode; },
    get playStage() { return play.stageId; },
    get player() { return { x: play.player.x, y: play.player.y }; },
    get kicks() { return play.kicks; },
    get actions() { return play.actions; },
    get paused() { return play.paused; }
  };
})();
