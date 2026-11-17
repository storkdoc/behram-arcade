/* GLOW MUNCH — input, cabinet screens, and the frame loop. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const CFG = 'glowmunch.cfg';
  const SCORES = 'glowmunch.scores';
  const KEYS = {
    ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3,
    KeyD: 0, KeyS: 1, KeyA: 2, KeyW: 3
  };
  const $ = (id) => document.getElementById(id);
  const canvas = $('view');
  const audio = GlowAudio.create();
  const render = GlowRender.create(canvas);
  let screen = 'title';
  let returnScreen = 'title';
  let game = null;
  let demo = null;
  let letters = [0, 0, 0];
  let slot = 0;
  let overOpened = false;
  const held = [];
  const ptr = { id: null, x: 0, y: 0, swiped: false };
  let lastTap = 0;
  let lastTapPos = null;
  const gpWas = [];
  let padHeld = false;

  function loadCfg() { try { return JSON.parse(localStorage.getItem(CFG) || '{}'); } catch (e) { return {}; } }
  const cfg = loadCfg();
  audio.setVolume(cfg.vol == null ? 0.8 : cfg.vol);
  audio.setMuted(!!cfg.muted);

  function saveCfg() {
    try { localStorage.setItem(CFG, JSON.stringify({ vol: audio.volume, muted: audio.muted })); } catch (e) { /* private mode */ }
  }
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES) || '[]'); } catch (e) { return []; } }
  function saveScores(list) { try { localStorage.setItem(SCORES, JSON.stringify(list.slice(0, 8))); } catch (e) { /* ignore */ } }
  function qualifies(score) {
    const list = loadScores();
    return list.length < 8 || score > list[list.length - 1].score;
  }
  function unlock() { if (!audio.unlocked) audio.start(); }

  function insets() {
    const s = getComputedStyle($('safe'));
    const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
    return { top: n(s.paddingTop), right: n(s.paddingRight), bottom: n(s.paddingBottom), left: n(s.paddingLeft) };
  }

  const api = {
    booted: false,
    get screen() { return screen; },
    get game() { return game; },
    audio: audio,
    project(x, y) { return render.project(x, y); },
    tileAt(px, py) { return render.tileAt(px, py); }
  };
  window.GLOWMUNCH = api;

  function mood(name) { if (window.MoodSticker) window.MoodSticker.screen(name); }
  function moodEvent(name) { if (window.MoodSticker) window.MoodSticker.event(name); }

  function show(name) {
    screen = name;
    mood(name === 'over' ? 'game-over' : name);
    for (const id of ['title', 'how', 'scores', 'credits', 'options', 'pause', 'over']) {
      $(id).hidden = id !== name;
    }
    $('hud').hidden = !(name === 'play' || name === 'pause');
    if (name === 'scores') renderScores();
    if (name === 'credits') renderCredits();
    syncOptions();
  }

  function freshDemo() {
    demo = GlowLogic.createGame({ demo: true, phase: 'play', ready: 0, seed: (Math.random() * 1e9) | 0 });
  }
  function startGame(seed) {
    game = GlowLogic.createGame({
      seed: seed == null ? (Math.random() * 1e9) | 0 : seed | 0,
      level: qs.get('level') ? (+qs.get('level') || 1) : 1,
      phase: 'play',
      ready: 0
    });
    if (!qs.get('play')) {
      game.phase = 'ready';
      game.phaseT = 1.2;
    }
    overOpened = false;
    held.length = 0;
    show('play');
    layout();
  }

  function renderScores() {
    const list = loadScores();
    $('scorelist').innerHTML = list.length ? list.map((row, i) =>
      '<div class="scoreline"><span>' + (i + 1) + '  ' + row.name + '</span><span>' + row.score + ' · L' + row.level + '</span></div>'
    ).join('') : '<p>No scores on this device yet.</p>';
  }
  function renderCredits() {
    $('creditlist').innerHTML = GlowAudio.TRACKS.map(t =>
      '<p><b>' + t.piece + '</b><br>' + t.composer + ' — ' + t.performer + '<br>' + t.license + '<br><a href="' + t.page + '">Source</a></p>'
    ).join('') + '<p>Sound effects are synthesized in the browser. The two recordings alternate and keep playing from lane to lane.</p>';
  }
  function syncOptions() {
    const vol = $('vol');
    if (!vol) return;
    vol.value = Math.round(audio.volume * 100);
    $('opt-mute').textContent = audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
    $('btn-mute').textContent = audio.muted ? 'OFF' : 'SND';
  }
  function syncHud() {
    if (!game || $('hud').hidden) return;
    $('score').textContent = String(game.score);
    $('lane').textContent = 'LANE ' + game.level;
    $('lives').textContent = game.lives > 0 ? '●'.repeat(game.lives) : '';
    const bits = [];
    if (game.streakMult > 1) bits.push('x' + game.streakMult);
    if (game.fright > 0 && game.chain > 0) bits.push('CHAIN ' + game.chain);
    $('combo').textContent = bits.join('  ');
    $('meter').firstElementChild.style.width = Math.round(game.player.meter) + '%';
    $('boost').classList.toggle('ready', game.player.meter >= 100);
    $('boost').disabled = game.player.meter < 100;
  }

  function openOver() {
    if (overOpened) return;
    overOpened = true;
    const hi = qualifies(game.score);
    $('overscore').textContent = game.score + ' POINTS · LANE ' + game.level;
    $('initials').hidden = !hi;
    letters = [0, 0, 0];
    slot = 0;
    paintLetters();
    show('over');
    moodEvent(hi ? 'win' : 'lose');
  }
  function paintLetters() {
    document.querySelectorAll('[data-li]').forEach(btn => {
      const i = +btn.getAttribute('data-li');
      btn.textContent = String.fromCharCode(65 + letters[i]);
      btn.classList.toggle('on', i === slot);
    });
  }
  function saveInitials() {
    const name = letters.map(n => String.fromCharCode(65 + n)).join('');
    const list = loadScores();
    list.push({ name: name, score: game.score, level: game.level });
    list.sort((a, b) => b.score - a.score);
    saveScores(list);
    $('initials').hidden = true;
    audio.playFx('ui');
  }

  function layout() { render.layout(insets()); }

  function noteEvents(g) {
    if (!g || !g.events) return;
    let ghostStep = 0;
    g.events.forEach(ev => {
      if (ev === 'dot') audio.playFx('dot', g.streakMult);
      else if (ev === 'power') audio.playFx('power');
      else if (ev === 'ghost') { audio.playFx('ghost', ghostStep++); moodEvent('big'); }
      else if (ev === 'fruit') { audio.playFx('fruit'); moodEvent('big'); }
      else if (ev === 'dash') audio.playFx('dash');
      else if (ev === 'die') { audio.playFx('die'); moodEvent('hit'); }
      else if (ev === 'clear' || ev === 'act') { audio.playFx('clear'); moodEvent('win'); }
      else if (ev === 'extra') { audio.playFx('extra'); moodEvent('big'); }
      else if (ev === 'streak' && g.streakMult > 1) moodEvent('big');
    });
  }

  function currentDir() { return held.length ? held[held.length - 1] : null; }

  const gpMap = () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (!gp || screen !== 'play') return;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let dir = null;
    if (Math.hypot(ax, ay) > 0.45) dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 0 : 2) : (ay > 0 ? 1 : 3);
    if (gp.buttons[12] && gp.buttons[12].pressed) dir = 3;
    if (gp.buttons[13] && gp.buttons[13].pressed) dir = 1;
    if (gp.buttons[14] && gp.buttons[14].pressed) dir = 2;
    if (gp.buttons[15] && gp.buttons[15].pressed) dir = 0;
    if (dir != null) { game.hold(dir); padHeld = true; }
    else if (padHeld) { padHeld = false; if (!held.length && ptr.id == null) game.release(); }
    const a = gp.buttons[0] && gp.buttons[0].pressed;
    if (a && !gpWas[0]) game.dash();
    gpWas[0] = a;
    const start = gp.buttons[9] && gp.buttons[9].pressed;
    if (start && !gpWas[9]) show('pause');
    gpWas[9] = start;
  };

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (screen === 'title') {
      if (!demo || demo.phase === 'over') freshDemo();
      demo.step(dt);
      render.frame(demo, dt);
    } else if (game) {
      if (screen === 'play') {
        gpMap();
        game.step(dt);
        noteEvents(game);
        if (game.phase === 'over') openOver();
      }
      render.frame(game, dt);
      syncHud();
    }
    audio.tick();
    requestAnimationFrame(frame);
  }

  document.addEventListener('pointerdown', (e) => {
    unlock();
    if (screen !== 'play') return;
    if (e.target !== canvas) return;
    ptr.id = e.pointerId;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.swiped = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  document.addEventListener('pointermove', (e) => {
    if (ptr.id !== e.pointerId || screen !== 'play' || !game) return;
    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    if (!ptr.swiped && Math.hypot(dx, dy) > 22) {
      ptr.swiped = true;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
      game.hold(dir);
    }
  });
  document.addEventListener('pointerup', (e) => {
    if (ptr.id !== e.pointerId) return;
    const swiped = ptr.swiped;
    const x = e.clientX, y = e.clientY;
    const dist = Math.hypot(x - ptr.x, y - ptr.y);
    ptr.id = null;
    if (screen !== 'play' || !game) return;
    if (swiped) return;
    if (dist > 18) return;
    const nowTap = performance.now();
    const close = lastTapPos && Math.hypot(x - lastTapPos.x, y - lastTapPos.y) < 32;
    if (close && nowTap - lastTap < 280) {
      game.dash();
      lastTap = 0;
      return;
    }
    lastTap = nowTap;
    lastTapPos = { x: x, y: y };
    const tile = render.tileAt(x, y);
    if (tile) game.tapTile(tile.x, tile.y);
  });
  document.addEventListener('pointercancel', () => { ptr.id = null; });

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    unlock();
    if (KEYS[e.code] != null && screen === 'play' && game) {
      e.preventDefault();
      const dir = KEYS[e.code];
      if (held.indexOf(dir) < 0) held.push(dir);
      game.hold(dir);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (screen === 'play' && game) game.dash();
      else if (screen === 'title') startGame();
      return;
    }
    if (e.code === 'Enter') {
      if (screen === 'title') startGame();
      else if (screen === 'over' && !$('initials').hidden) saveInitials();
      else if (screen === 'pause') show('play');
      return;
    }
    if ((e.code === 'KeyP' || e.code === 'Escape') && (screen === 'play' || screen === 'pause')) {
      e.preventDefault();
      show(screen === 'play' ? 'pause' : 'play');
      return;
    }
    if (e.code === 'KeyM') { audio.toggleMuted(); saveCfg(); syncOptions(); return; }
    if (screen === 'over' && !$('initials').hidden) {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        slot = (slot + (e.code === 'ArrowRight' ? 1 : 2)) % 3;
        paintLetters();
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        letters[slot] = (letters[slot] + (e.code === 'ArrowUp' ? 1 : 25)) % 26;
        paintLetters();
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    if (KEYS[e.code] == null) return;
    const dir = KEYS[e.code];
    const i = held.indexOf(dir);
    if (i >= 0) held.splice(i, 1);
    if (screen === 'play' && game) {
      const next = currentDir();
      if (next == null) game.release();
      else game.hold(next);
    }
  });

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    unlock();
    audio.playFx('ui');
    if (btn.dataset.go) {
      returnScreen = screen === 'pause' ? 'pause' : 'title';
      show(btn.dataset.go);
      return;
    }
    if (btn.dataset.back != null) { show(returnScreen === 'pause' ? 'pause' : 'title'); return; }
    if (btn.id === 'play' || btn.id === 'again') { startGame(); return; }
    if (btn.id === 'resume') show('play');
    if (btn.id === 'quit') { game = null; freshDemo(); show('title'); }
    if (btn.id === 'boost' && game) game.dash();
    if (btn.id === 'btn-pause') show('pause');
    if (btn.id === 'btn-mute' || btn.id === 'opt-mute') { audio.toggleMuted(); saveCfg(); syncOptions(); }
    if (btn.id === 'save-score') saveInitials();
    if (btn.id === 'over-menu') { game = null; freshDemo(); show('title'); }
    if (btn.dataset.li != null) {
      slot = +btn.dataset.li;
      letters[slot] = (letters[slot] + 1) % 26;
      paintLetters();
    }
  });
  $('vol').addEventListener('input', () => {
    audio.setVolume(+$('vol').value / 100);
    saveCfg();
  });

  window.addEventListener('resize', layout);
  window.addEventListener('blur', () => { held.length = 0; if (game && screen === 'play') game.release(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') show('pause'); });

  freshDemo();
  layout();
  show('title');
  if (qs.get('play')) startGame(qs.get('seed') ? (+qs.get('seed') | 0) : 1);
  if (qs.get('mute') === '1') audio.setMuted(true);
  api.booted = true;
  requestAnimationFrame(frame);
})();
