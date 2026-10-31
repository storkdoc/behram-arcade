/* CHALICE — main.js : screens, layout, input (keyboard, mouse, touch, gamepad), HUD, tutorial,
   timer / best times and the Mood-Sticker hooks. */
(function () {
  'use strict';
  const World = window.ChaliceWorld, Sim = window.ChaliceSim, Bot = window.ChaliceBot, Render = window.ChaliceRender, Au = window.ChaliceAudio;
  const cv = document.getElementById('screen'), g = cv.getContext('2d');
  const R = Render.create(cv);
  const TAU = Math.PI * 2, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const MS = (k, a) => { try { if (window.MoodSticker) window.MoodSticker[k](a); } catch (e) { /* ignore */ } };
  const store = { get(k, d) { try { const v = localStorage.getItem('chalice.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('chalice.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } } };
  const ROMAN = ['', 'I', 'II', 'III', 'IV'];
  const FONT = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
  const UI = '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

  const App = {
    screen: 'title', S: null, bot: null, demo: null, demoBot: null, level: store.get('level', 1), diffL: store.get('diffL', 'B'), diffR: store.get('diffR', 'B'),
    sound: store.get('sound', true), music: store.get('music', true), focus: 0, acc: 0, last: 0, t: 0, deadT: 0, toast: null, toasts: [], banner: null,
    tutorialDone: store.get('tut', false), tut: {}, input: (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'touch' : 'key', W: 0, H: 0, dpr: 1, L: null, result: null, prevScreen: null, help: 0,
  };
  window.ChaliceApp = App;
  Au.on = App.sound; Au.musicOn = App.music;

  /* =============================== layout =============================== */
  const isTouch = () => App.input === 'touch';
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const W = window.innerWidth, H = window.innerHeight;
    App.W = W; App.H = H; App.dpr = dpr;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const sa = getComputedStyle(document.getElementById('safe')); const st = parseFloat(sa.paddingTop) || 0, sb = parseFloat(sa.paddingBottom) || 0, sl = parseFloat(sa.paddingLeft) || 0, sr = parseFloat(sa.paddingRight) || 0;
    const portrait = H > W * 1.05;
    const hud = portrait ? 46 : Math.max(36, Math.min(48, H * 0.07));
    let vx, vy, vw, vh, ctrl = null;
    if (portrait) {
      vw = W - sl - sr; vh = vw * 12 / 20; vx = sl; vy = st + hud + 6;
      ctrl = { x: sl, y: vy + vh, w: vw, h: H - sb - (vy + vh) };
    } else {
      const aw = W - sl - sr - 8, ah = H - st - sb - hud - 6; vw = Math.min(aw, ah * 20 / 12); vh = vw * 12 / 20; vx = sl + 4 + (aw - vw) / 2; vy = st + hud + (ah - vh) / 2;
    }
    App.L = { portrait, hud, st, sb, sl, sr, vx, vy, vw, vh, ctrl };
    R.resize({ x: Math.round(vx * dpr), y: Math.round(vy * dpr), w: Math.round(vw * dpr), h: Math.round(vh * dpr) });
    R.quality = (vw * dpr > 1600) ? 1 : 0.8;
  }
  window.addEventListener('resize', layout); window.addEventListener('orientationchange', () => setTimeout(layout, 120));

  /* =============================== game control =============================== */
  function newGame(level) {
    App.level = level || App.level; store.set('level', App.level);
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    App.S = Sim.create({ level: App.level, seed: App.level >= 3 ? seed : 1 + App.level, diffL: App.diffL, diffR: App.diffR, tutorial: App.level === 1 && !App.tutorialDone });
    App.S.room = App.S.w.roomAt(Math.floor(App.S.player.x), Math.floor(App.S.player.y));
    App.S.visited[App.S.room.id] = 0.001;
    R.reset(); App.acc = 0; App.deadT = 0; App.toasts = []; App.toast = null; App.tut = {}; App.result = null; App.lastRoom = null;
    banner(World.LEVELS[App.level].name, 'Level ' + ROMAN[App.level]);
    go('play');
    if (App.level === 1 && !App.tutorialDone) toast(isTouch() ? 'Drag anywhere on the left to walk.' : 'Arrow keys or WASD to walk. Hold the mouse to walk toward it.', 5);
    else toast(App.level === 4 ? 'Find the three keys and lay them on the Jade pedestals.' : 'Find the Chalice and return it to the Gold Castle.', 4);
  }
  function go(screen) { App.prevScreen = App.screen; App.screen = screen; App.focus = 0; MS('screen', screen); document.body.dataset.screen = screen; document.body.classList.toggle('ingame', screen === 'play' || screen === 'map' || screen === 'paused' || screen === 'win'); }
  function toast(text, dur) { App.toasts.push({ text, dur: dur || 3.5 }); }
  function banner(title, sub) { App.banner = { title, sub, t: 0 }; }
  function fmt(t) { if (t == null) return '--:--'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
  const bestKey = () => 'best.L' + App.level + App.diffL + App.diffR;

  /* =============================== input =============================== */
  const keys = new Set(); const edge = { drop: false, flare: false, map: false, pause: false };
  const touch = { joy: null, btns: new Map() }; const mouse = { down: false, x: 0, y: 0 };
  let padPrev = {};
  function markInput(kind) { if (App.input !== kind) { App.input = kind; } }
  function unlockAudio() { Au.unlock(); }
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    markInput('key'); unlockAudio();
    const k = e.key;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab'].includes(k)) e.preventDefault();
    if (e.repeat && (k === ' ' || k === 'Enter')) return;
    keys.add(k.length === 1 ? k.toLowerCase() : k);
    if (App.screen === 'play' || App.screen === 'map' || App.screen === 'paused') {
      if (k === ' ') edge.drop = true; else if (k === 'Enter') edge.flare = true;
      else if (k === 'm' || k === 'M' || k === 'Tab') edge.map = true; else if (k === 'p' || k === 'P' || k === 'Escape') edge.pause = true;
    } else menuKey(k);
  });
  window.addEventListener('keyup', e => { const k = e.key; keys.delete(k.length === 1 ? k.toLowerCase() : k); });
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; touch.joy = null; if (App.screen === 'play') go('paused'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && App.screen === 'play') go('paused'); });

  // hit-testable buttons rebuilt every frame
  let buttons = [];
  function hit(x, y) { for (let i = buttons.length - 1; i >= 0; i--) { const b = buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; } return null; }
  function press(b) { Au.sfx('ui'); b.fn(); }
  cv.addEventListener('mousedown', e => { markInput('mouse'); unlockAudio(); const b = hit(e.clientX, e.clientY); if (b) { press(b); return; } if (App.screen === 'play') { mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; } });
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; if (App.input !== 'mouse' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) markInput('mouse'); App.hover = hit(e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); if (App.screen === 'play') edge.drop = true; });
  const tOpts = { passive: false };
  cv.addEventListener('touchstart', e => {
    e.preventDefault(); markInput('touch'); unlockAudio();
    for (const t of e.changedTouches) {
      const b = hit(t.clientX, t.clientY);
      if (b) { touch.btns.set(t.identifier, b); b.held = true; press(b); continue; }
      if (App.screen === 'play') { const L = App.L; const joyZone = L.portrait ? t.clientY > L.vy : t.clientX < App.W * 0.55; if (!touch.joy && joyZone) touch.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY }; }
      else if (App.screen === 'map' || App.screen === 'win' && !b) { /* tap outside buttons */ if (App.screen === 'map') edge.map = true; }
    }
  }, tOpts);
  cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (touch.joy && t.identifier === touch.joy.id) { touch.joy.x = t.clientX; touch.joy.y = t.clientY; const dx = t.clientX - touch.joy.ox, dy = t.clientY - touch.joy.oy, d = Math.hypot(dx, dy), mx = 60; if (d > mx) { touch.joy.ox += dx * (1 - mx / d); touch.joy.oy += dy * (1 - mx / d); } } }, tOpts);
  const tEnd = e => { e.preventDefault(); for (const t of e.changedTouches) { if (touch.joy && t.identifier === touch.joy.id) touch.joy = null; const b = touch.btns.get(t.identifier); if (b) { b.held = false; touch.btns.delete(t.identifier); } } };
  cv.addEventListener('touchend', tEnd, tOpts); cv.addEventListener('touchcancel', tEnd, tOpts);
  document.addEventListener('gesturestart', e => e.preventDefault());

  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let p = null; for (const q of pads || []) if (q && q.connected) { p = q; break; }
    if (!p) return null; const B = i => !!(p.buttons[i] && p.buttons[i].pressed);
    const st = { x: p.axes[0] || 0, y: p.axes[1] || 0, a: B(0), b: B(1), x2: B(2), y2: B(3), back: B(8), start: B(9), up: B(12), down: B(13), left: B(14), right: B(15) };
    if (B(14)) st.x = -1; if (B(15)) st.x = 1; if (B(12)) st.y = -1; if (B(13)) st.y = 1;
    const pr = n => st[n] && !padPrev[n];
    if (Math.hypot(st.x, st.y) > 0.4 || st.a || st.b || st.start) markInput('pad');
    if (App.screen === 'play' || App.screen === 'map' || App.screen === 'paused') { if (pr('a')) edge.drop = true; if (pr('b') || pr('x2')) edge.flare = true; if (pr('y2') || pr('back')) edge.map = true; if (pr('start')) edge.pause = true; }
    else { const nav = { up: st.y < -0.5, down: st.y > 0.5, left: st.x < -0.5, right: st.x > 0.5 }; for (const k in nav) { if (nav[k] && !padPrev['n' + k]) menuKey({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[k]); st['n' + k] = nav[k]; } if (pr('a') || pr('start')) menuKey('Enter'); if (pr('b')) menuKey('Escape'); }
    padPrev = st; return st;
  }
  function moveVector(pad) {
    let mx = 0, my = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) mx -= 1; if (keys.has('ArrowRight') || keys.has('d')) mx += 1; if (keys.has('ArrowUp') || keys.has('w')) my -= 1; if (keys.has('ArrowDown') || keys.has('s')) my += 1;
    if (pad && Math.hypot(pad.x, pad.y) > 0.22) { mx = pad.x; my = pad.y; }
    if (touch.joy) { const dx = touch.joy.x - touch.joy.ox, dy = touch.joy.y - touch.joy.oy, d = Math.hypot(dx, dy); if (d > 8) { const k = Math.min(1, (d - 8) / 40); mx = dx / d * k; my = dy / d * k; } }
    if (mouse.down && App.S) { const L = App.L, ts = L.vw / 20; const P = App.S.player, r = App.S.room; const px = L.vx + (P.x - r.x0) * ts, py = L.vy + (P.y - r.y0) * ts; const dx = mouse.x - px, dy = mouse.y - py, d = Math.hypot(dx, dy); if (d > ts * 0.3) { const k = Math.min(1, d / (ts * 1.5)); mx = dx / d * k; my = dy / d * k; } }
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    return [mx, my];
  }

  /* =============================== menus =============================== */
  const MENU = () => [
    { id: 'start', label: 'BEGIN THE QUEST' },
    { id: 'level', label: 'Level  ' + ROMAN[App.level] + ' \u2014 ' + World.LEVELS[App.level].name, lr: true },
    { id: 'diffL', label: 'Left switch  ' + App.diffL + (App.diffL === 'A' ? ' \u2014 dragons bite fast' : ' \u2014 dragons bite slowly'), lr: true },
    { id: 'diffR', label: 'Right switch  ' + App.diffR + (App.diffR === 'A' ? ' \u2014 dragons flee the sword' : ' \u2014 dragons stand and fight'), lr: true },
    { id: 'help', label: 'How to play' },
    { id: 'sound', label: 'Sound  ' + (App.sound ? (App.music ? 'music + effects' : 'effects only') : 'off'), lr: true },
  ];
  function menuAct(id, dir) {
    if (id === 'start') { if (dir) return; newGame(App.level); return; }
    if (id === 'level') { App.level = ((App.level - 1 + (dir || 1) + 4) % 4) + 1; store.set('level', App.level); }
    if (id === 'diffL') { App.diffL = App.diffL === 'A' ? 'B' : 'A'; store.set('diffL', App.diffL); }
    if (id === 'diffR') { App.diffR = App.diffR === 'A' ? 'B' : 'A'; store.set('diffR', App.diffR); }
    if (id === 'help') { if (dir) return; App.help = 0; go('help'); }
    if (id === 'sound') { const st = !App.sound ? 0 : App.music ? 1 : 2; const nx = (st + (dir || 1) + 3) % 3; App.sound = nx !== 0; App.music = nx === 1; store.set('sound', App.sound); store.set('music', App.music); Au.setOn(App.sound); Au.setMusic(App.music); }
  }
  function menuKey(k) {
    if (App.screen === 'title') { const M = MENU(); if (k === 'ArrowUp' || k === 'w') App.focus = (App.focus + M.length - 1) % M.length; else if (k === 'ArrowDown' || k === 's') App.focus = (App.focus + 1) % M.length; else if (k === 'ArrowLeft' || k === 'a') menuAct(M[App.focus].id, -1); else if (k === 'ArrowRight' || k === 'd') menuAct(M[App.focus].id, 1); else if (k === 'Enter' || k === ' ') { Au.sfx('ui'); menuAct(M[App.focus].id, 0); } return; }
    if (App.screen === 'help') { if (k === 'ArrowRight' || k === 'Enter' || k === ' ') { if (App.help < 2) App.help++; else go('title'); } else if (k === 'ArrowLeft') App.help = Math.max(0, App.help - 1); else if (k === 'Escape') go('title'); return; }
    if (App.screen === 'win') { if (k === 'Enter' || k === ' ') newGame(App.level < 4 ? App.level + 1 : App.level); else if (k === 'r' || k === 'R') newGame(App.level); else if (k === 'Escape') go('title'); }
  }

  /* =============================== simulation & events =============================== */
  function handleEvents(S, evs, live) {
    R.fx(evs, S);
    if (live) Au.events(evs);
    if (!live) return;
    for (const e of evs) {
      switch (e.type) {
        case 'start': MS('event', 'start'); break;
        case 'gate': MS('event', 'big'); if (e.key === 'jade') { toast('The Jade reliquary opens!', 3); if (!S.w.gates.find(q => q.key === 'gold').open) toast('The keys can be lifted again \u2014 you will need the Gold Key to get home.', 5); } else toast('The ' + cap(e.key) + ' Castle gate rises.', 3); break;
        case 'chalice': if (!App.tut.chalice) { App.tut.chalice = 1; MS('event', 'big'); toast('The Chalice! Carry it into the Gold Castle\u2019s hall.', 4.5); } break;
        case 'slay': { MS('event', 'big'); const d = S.dragons.find(x => x.id === e.dragon); toast((d ? d.name + ', ' + d.title + ',' : 'The dragon') + ' is slain!', 3); break; }
        case 'steal': MS('event', 'stall'); toast('The bat stole ' + (S.ITEM_NAME[e.item] || 'your treasure') + '!', 3); break;
        case 'eaten': { MS('event', 'lose'); App.deadT = 0; go('play'); MS('screen', 'eaten'); break; }
        case 'reborn': MS('screen', 'play'); break;
        case 'makers': toast('You found the secret room!', 4); MS('event', 'big'); break;
        case 'room': if (e.first) { const r = S.w.rooms[e.room]; if (r && r.name && r.id !== 'gold_castle') banner(r.name, null); } break;
        case 'roar': if (!App.tut.roar) { App.tut.roar = 1; toast(isTouch() ? 'A dragon! Tap FLARE to daze it, or strike it with the sword.' : 'A dragon! ENTER fires a flare that dazes it. The sword\u2019s blade slays it.', 4.5); } break;
        case 'pick':
          if (e.item === 'sword' && !App.tut.sword) { App.tut.sword = 1; toast('The Sword. Touch a dragon with its blade to slay it.', 4); }
          else if (['gold', 'black', 'white'].includes(e.item) && !App.tut.key) { App.tut.key = 1; toast('A key opens the castle of its colour: touch the gate with it.', 4); }
          else if (e.item === 'bridge' && !App.tut.bridge) { App.tut.bridge = 1; toast('Lay the Bridge across a wall or river to cross it.', 4); }
          else if (e.item === 'magnet' && !App.tut.magnet) { App.tut.magnet = 1; toast('The Magnet pulls the nearest treasure in a room toward it.', 4); }
          else if (e.item === 'dot' && !App.tut.dot) { App.tut.dot = 1; toast('A strange grey dot\u2026 some walls feel thinner now.', 4); }
          if (!App.tut.drop && App.level === 1) { App.tut.drop = 1; setTimeout(() => toast(isTouch() ? 'You carry one thing. DROP sets it down.' : 'You carry one thing at a time. SPACE drops or swaps it.', 3.5), 4200); }
          break;
        case 'win': {
          const best = store.get(bestKey(), null); const rec = best == null || S.time < best; if (rec) store.set(bestKey(), S.time);
          App.result = { time: S.time, best: rec ? S.time : best, record: rec, deaths: S.deaths, slain: S.slain, steals: S.steals, prev: best };
          if (App.level === 1) { App.tutorialDone = true; store.set('tut', true); }
          const done = store.get('won', {}); done[App.level] = 1; store.set('won', done);
          MS('event', 'win'); setTimeout(() => { if (App.S === S) go('win'); }, 2200); break; }
      }
    }
    if (S.room && App.lastRoom !== S.room) { App.lastRoom = S.room; Au.setArea(S.room.kind); if (App.tut && Object.keys(S.visited).length >= 4 && !App.tut.map) { App.tut.map = 1; toast(isTouch() ? 'Tap MAP to see the kingdom you have explored.' : 'Press M (or Tab) for the map of explored rooms.', 4); } }
  }
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function updateDemo(dt) {
    if (!App.demo || App.demo.won && App.demo.wonT > 3 || App.demo.time > 150) { App.demo = Sim.create({ level: 2, seed: (Math.random() * 1e9) >>> 0 }); App.demoBot = Bot.create(App.demo); App.demo.room = App.demo.w.rooms.gold_castle; R.reset(); }
    App.dacc = (App.dacc || 0) + dt; let n = 0;
    while (App.dacc >= 1 / 60 && n < 4) { App.dacc -= 1 / 60; n++; const evs = App.demo.step(App.demoBot.think(), 1 / 60); R.fx(evs, App.demo); App.demo.room = App.demo.roomOf(App.demo.player.x, App.demo.player.y) || App.demo.room; }
  }
  function update(dt) {
    const pad = readPad();
    if (App.banner) { App.banner.t += dt; if (App.banner.t > 3.2) App.banner = null; }
    if (App.toast) { App.toast.t += dt; if (App.toast.t > App.toast.dur) App.toast = null; } else if (App.toasts.length) { App.toast = Object.assign(App.toasts.shift(), { t: 0 }); }
    if (App.screen === 'title' || App.screen === 'help') { updateDemo(dt); Au.setArea('title'); Au.setDanger(0); edge.drop = edge.flare = edge.map = edge.pause = false; return; }
    const S = App.S; if (!S) return;
    if (App.screen === 'map') { if (edge.map || edge.pause || edge.drop) go('play'); edge.drop = edge.flare = edge.map = edge.pause = false; return; }
    if (App.screen === 'paused') { if (edge.pause || edge.drop || edge.flare) go('play'); edge.map = edge.pause = edge.drop = edge.flare = false; return; }
    if (App.screen === 'win') { App.acc = 0; S.step({}, dt); R.fx([], S); edge.drop = edge.flare = edge.map = edge.pause = false; return; }
    if (edge.pause) { edge.pause = false; go('paused'); return; }
    if (edge.map) { edge.map = false; go('map'); return; }
    const [mx, my] = moveVector(pad);
    if (S.player.dead) App.deadT += dt;
    App.acc += Math.min(dt, 0.1); let n = 0;
    while (App.acc >= 1 / 60 && n < 6) {
      App.acc -= 1 / 60; n++;
      const inp = { mx, my, drop: edge.drop && (!S.player.dead || App.deadT > 1.2), flare: edge.flare };
      if (inp.drop || !S.player.dead) edge.drop = false; edge.flare = false;
      const evs = S.step(inp, 1 / 60);
      handleEvents(S, evs, true);
    }
    // music danger layer: a dragon chasing nearby
    let danger = 0; for (const d of S.dragons) if (d.alive && (d.state === 'chase' || d.state === 'bite')) danger = Math.max(danger, clamp(1.4 - Math.hypot(d.x - S.player.x, d.y - S.player.y) / 14, 0, 1));
    Au.setDanger(danger); Au.listen(S.player.x, S.player.y);
    if (App.level === 1 && !App.tut.flareHint && S.time > 70 && !S.item('chalice').holder) { App.tut.flareHint = 1; toast('Lost? The chalice lies in the Black Castle, beyond the Blue Labyrinth.', 4); }
  }

  /* =============================== drawing helpers =============================== */
  function rr(x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function panel(x, y, w, h, a) { g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 18; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, `rgba(40,30,22,${a || 0.9})`); gr.addColorStop(1, `rgba(20,14,10,${a || 0.9})`); g.fillStyle = gr; rr(x, y, w, h, 14); g.fill(); g.restore(); g.strokeStyle = 'rgba(226,185,85,0.75)'; g.lineWidth = 1.5; rr(x + 3, y + 3, w - 6, h - 6, 11); g.stroke(); }
  function text(s, x, y, size, col, align, font, weight) { g.font = `${weight || ''} ${size}px ${font || FONT}`; g.fillStyle = col || '#fff'; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
  function fitText(s, x, y, size, maxW, col, align, font, weight) { g.font = `${weight || ''} ${size}px ${font || FONT}`; let sz = size; while (sz > 8 && g.measureText(s).width > maxW) { sz -= 1; g.font = `${weight || ''} ${sz}px ${font || FONT}`; } text(s, x, y, sz, col, align, font, weight); }
  function button(id, label, x, y, w, h, fn, o) {
    o = o || {}; const hov = (App.hover && App.hover.id === id) || o.focus; const held = buttons.find(b => b.id === id && b.held);
    g.save(); g.globalAlpha = o.alpha || 1;
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, hov ? '#6b4d1e' : o.bg || '#3b2b18'); gr.addColorStop(1, hov ? '#3e2a0e' : '#1d140b'); g.fillStyle = gr; rr(x, y, w, h, o.round || Math.min(12, h / 2)); g.fill();
    g.strokeStyle = hov ? '#ffe08a' : 'rgba(226,185,85,0.8)'; g.lineWidth = hov ? 2.5 : 1.5; g.stroke();
    fitText(label, x + w / 2, y + h / 2 + 1, o.size || Math.min(20, h * 0.42), w - 12, o.col || '#f6e7c1', 'center', o.font || FONT, '600');
    if (o.sub) text(o.sub, x + w / 2, y + h * 0.8, Math.min(11, h * 0.2), 'rgba(246,231,193,0.65)', 'center', UI);
    g.restore();
    const b = { id, x, y, w, h, fn, held: held ? held.held : false }; buttons.push(b); return b;
  }

  /* =============================== screens =============================== */
  function drawPlayfield(S, dt) { const out = R.draw(S, dt); return out; }
  function drawFrame(dt) {
    const d = App.dpr; g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0907'; g.fillRect(0, 0, cv.width, cv.height);
    const L = App.L;
    const prevButtons = buttons; buttons = [];
    for (const b of prevButtons) if (b.held) { /* keep held state across frames */ }
    if (App.screen === 'title' || App.screen === 'help') {
      if (App.demo) { R.draw(App.demo, dt); }
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = 'rgba(8,6,12,0.45)'; g.fillRect(0, 0, App.W, App.H);
      if (App.screen === 'title') drawTitle(); else drawHelp();
    } else {
      const S = App.S; drawPlayfield(S, App.screen === 'paused' || App.screen === 'map' ? 0 : dt);
      g.setTransform(d, 0, 0, d, 0, 0);
      drawFrameBorder(); drawHUD(S);
      if (App.screen === 'play') { drawTouch(S); drawEaten(S); }
      if (App.screen === 'map') drawMapScreen(S);
      if (App.screen === 'paused') drawPause();
      if (App.screen === 'win') drawWin(S);
    }
    drawBanner(); drawToast();
    for (const b of buttons) { const p = prevButtons.find(q => q.id === b.id); if (p && p.held) b.held = true; }
    for (const [tid, b] of touch.btns) { const nb = buttons.find(q => q.id === b.id); if (nb) { nb.held = true; touch.btns.set(tid, nb); } }
  }
  function drawFrameBorder() { const L = App.L; g.save(); g.strokeStyle = 'rgba(226,185,85,0.55)'; g.lineWidth = 2; g.strokeRect(L.vx - 1, L.vy - 1, L.vw + 2, L.vh + 2); g.restore(); }
  function drawHUD(S) {
    const L = App.L, P = S.player; const y = L.st, h = L.hud; const left = L.sl + (isTouch() ? 10 : 110), right = App.W - L.sr - 10;
    g.save();
    const gr = g.createLinearGradient(0, 0, 0, y + h); gr.addColorStop(0, 'rgba(30,22,14,0.95)'); gr.addColorStop(1, 'rgba(18,12,8,0.85)'); g.fillStyle = gr; g.fillRect(0, 0, App.W, y + h);
    g.strokeStyle = 'rgba(226,185,85,0.5)'; g.beginPath(); g.moveTo(0, y + h - 0.5); g.lineTo(App.W, y + h - 0.5); g.stroke();
    const cy = y + h / 2; const narrow = App.W < 520;
    // held item slot
    const sx = isTouch() && L.portrait ? L.sl + 62 : left; const ss = h - 10;
    g.fillStyle = 'rgba(0,0,0,0.45)'; rr(sx, cy - ss / 2, ss, ss, 8); g.fill(); g.strokeStyle = 'rgba(226,185,85,0.7)'; g.lineWidth = 1.5; g.stroke();
    if (P.held) { const it = P.held; g.save(); g.translate(sx + ss / 2, cy); const sc = it.kind === 'bridge' ? 0.42 : it.kind === 'sword' ? 0.85 : 1; const fake = Object.assign({}, it, { x: 0, y: 0, ang: it.kind === 'sword' || it.kind === 'key' ? -0.6 : 0, holder: 'hud' }); g.scale(sc, sc); R.spriteItem(g, fake, ss * 0.62, App.t); g.restore(); }
    const lx = sx + ss + 10;
    if (!narrow || !P.held) fitText(P.held ? S.ITEM_NAME[P.held.id] : 'empty hands', lx, cy - 7, 13, 140, '#f3e2b6', 'left', FONT, 'italic');
    fitText('Level ' + ROMAN[App.level] + (narrow ? '' : ' \u00b7 ' + World.LEVELS[App.level].name), lx, cy + 9, 11, narrow ? 80 : 190, 'rgba(243,226,182,0.6)', 'left', UI);
    // timer / best
    const mh = h - 10, mw = Math.min(narrow ? 64 : 110, mh * 2); const mx = right - mw - (isTouch() ? 44 : 128);
    const noGauge = narrow && isTouch(); const fx = mx - 24, fr = 12;
    const mid = narrow ? (lx + 84 + (noGauge ? mx : fx - fr) - 4) / 2 : App.W / 2;
    text(fmt(S.time), mid, cy - (narrow ? 4 : 5), narrow ? 18 : 22, '#ffe7a3', 'center', UI, '700');
    const best = store.get(bestKey(), null); text('best ' + fmt(best), mid, cy + (narrow ? 12 : 13), 10, 'rgba(255,231,163,0.55)', 'center', UI);
    // minimap
    R.drawMinimap(g, S, mx, cy - mh / 2, mw, mh);
    // flare gauge
    const cd = clamp(1 - P.flareCD / 10, 0, 1);
    if (!noGauge) {
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 4; g.beginPath(); g.arc(fx, cy, fr, 0, TAU); g.stroke();
    g.strokeStyle = cd >= 1 ? '#ffe9a0' : '#a08850'; g.beginPath(); g.arc(fx, cy, fr, -Math.PI / 2, -Math.PI / 2 + cd * TAU); g.stroke();
    text('\u2737', fx, cy + 1, 13, cd >= 1 ? '#fff6cc' : 'rgba(255,255,255,0.4)', 'center', UI);
    }
    // buttons: map + pause (mouse/keyboard: also labels)
    if (!isTouch()) { button('map', 'Map  M', right - 120, cy - 14, 62, 28, () => go('map'), { size: 13 }); button('pause', '\u275a\u275a  P', right - 52, cy - 14, 52, 28, () => go('paused'), { size: 13 }); }
    else button('pause', '\u275a\u275a', right - 36, cy - 16, 36, 32, () => go('paused'), { size: 14 });
    g.restore();
  }
  function drawTouch(S) {
    if (!isTouch()) { // tiny mouse buttons under the playfield
      const L = App.L; const y = L.vy + L.vh - 40; if (App.input === 'mouse') { button('drop', 'DROP', L.vx + L.vw - 170, y, 76, 30, () => { edge.drop = true; }, { alpha: 0.85, size: 13 }); button('flare', 'FLARE', L.vx + L.vw - 88, y, 76, 30, () => { edge.flare = true; }, { alpha: 0.85, size: 13 }); }
      return;
    }
    const L = App.L; const P = S.player;
    let bx, by, bs;
    if (L.portrait && L.ctrl && L.ctrl.h > 120) { const c = L.ctrl; bs = Math.min(84, c.h * 0.36, c.w * 0.21); bx = c.x + c.w - bs * 1.2 - 12; by = c.y + c.h * 0.42;
      text('drag here to walk', c.x + c.w * 0.3, c.y + c.h - 18, 12, 'rgba(255,240,200,0.3)', 'center', UI);
      button('map', 'MAP', c.x + c.w - bs * 2.6 - 4, by + bs * 0.95, bs * 0.9, bs * 0.5, () => go('map'), { size: 13 });
    } else { bs = Math.min(76, App.H * 0.17); bx = App.W - L.sr - bs * 1.25 - 14; by = App.H - L.sb - bs * 1.3 - 12;
      button('map', 'MAP', App.W - L.sr - bs * 0.9 - 10, L.vy + 10, bs * 0.8, bs * 0.45, () => go('map'), { size: 12, alpha: 0.75 }); }
    const round = (id, label, cx, cy, r, fn, col, sub, dis) => { const held = buttons.find(b => b.id === id); g.save(); g.globalAlpha = dis ? 0.4 : 0.85; const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,240,200,0.8)'; g.lineWidth = 2; g.stroke(); text(label, cx, cy - (sub ? 5 : 0), Math.round(r * 0.36), '#fff8e0', 'center', UI, '800'); if (sub) text(sub, cx, cy + r * 0.32, Math.round(r * 0.22), 'rgba(255,248,224,0.7)', 'center', UI); g.restore(); buttons.push({ id, x: cx - r * 1.15, y: cy - r * 1.15, w: r * 2.3, h: r * 2.3, fn }); };
    const dropLabel = P.dead ? 'RISE' : P.held ? 'DROP' : 'DROP';
    round('drop', dropLabel, bx + bs * 0.55, by + bs * 0.5, bs * 0.55, () => { edge.drop = true; }, ['#d9a441', '#7a4c12'], P.held ? '' : '');
    round('flare', 'FLARE', bx - bs * 0.55, by - bs * 0.15, bs * 0.4, () => { edge.flare = true; }, ['#9fd0ff', '#2a4f8a'], P.flareCD > 0 ? Math.ceil(P.flareCD) + 's' : '', P.flareCD > 0);
    if (touch.joy) { const j = touch.joy; g.save(); g.globalAlpha = 0.5; g.strokeStyle = '#ffe9b0'; g.lineWidth = 2; g.beginPath(); g.arc(j.ox, j.oy, 56, 0, TAU); g.stroke(); g.globalAlpha = 0.7; g.fillStyle = '#ffe9b0'; const dx = j.x - j.ox, dy = j.y - j.oy, dd = Math.hypot(dx, dy), k = dd > 56 ? 56 / dd : 1; g.beginPath(); g.arc(j.ox + dx * k, j.oy + dy * k, 24, 0, TAU); g.fill(); g.restore(); }
  }
  function drawEaten(S) {
    const P = S.player; if (!P.dead) return; const L = App.L; const d = S.dragons.find(x => x.id === P.eater);
    const a = clamp(App.deadT / 0.8, 0, 1); g.save(); g.globalAlpha = a;
    const w = Math.min(420, L.vw - 20), h = 112, x = L.vx + (L.vw - w) / 2, y = L.vy + L.vh * 0.3; panel(x, y, w, h, 0.85);
    fitText('Devoured by ' + (d ? d.name + ', ' + d.title : 'a dragon') + '!', x + w / 2, y + 34, 22, w - 30, '#ff9a8a', 'center', FONT, 'bold italic');
    if (App.deadT > 1.2) text(isTouch() ? 'Tap RISE to return to the Gold Castle' : (App.input === 'pad' ? 'Press A to rise again' : 'Press SPACE to rise again at the Gold Castle'), x + w / 2, y + 74, 14, '#f3e2b6', 'center', UI);
    g.restore();
    if (App.deadT > 1.2 && !isTouch()) buttons.push({ id: 'rise', x: x, y: y, w, h, fn: () => { edge.drop = true; } });
  }
  function drawMapScreen(S) {
    g.fillStyle = 'rgba(5,4,8,0.6)'; g.fillRect(0, 0, App.W, App.H);
    const L = App.L; const pad = 20; const top = L.st + L.hud + 14; const w = App.W - pad * 2 - L.sl - L.sr; const x = L.sl + pad; const h = App.H - top - L.sb - 34;
    R.drawMap(g, S, x, top, w, h, App.t);
    text(isTouch() ? 'tap to close' : 'M / Tab / Space to close', App.W / 2, App.H - L.sb - 16, 12, 'rgba(255,240,200,0.6)', 'center', UI);
    buttons.push({ id: 'closemap', x: 0, y: 0, w: App.W, h: App.H, fn: () => go('play') });
  }
  function drawPause() {
    g.fillStyle = 'rgba(5,4,8,0.6)'; g.fillRect(0, 0, App.W, App.H); const w = Math.min(340, App.W - 30), h = 300, x = (App.W - w) / 2, y = (App.H - h) / 2; panel(x, y, w, h);
    text('Paused', App.W / 2, y + 40, 30, '#ffe39a', 'center', FONT, 'italic bold');
    button('resume', 'Resume', x + 30, y + 74, w - 60, 44, () => go('play'), { focus: true });
    button('restart', 'Restart level', x + 30, y + 128, w - 60, 44, () => newGame(App.level));
    button('sound2', 'Sound: ' + (App.sound ? (App.music ? 'music + effects' : 'effects only') : 'off'), x + 30, y + 182, w - 60, 40, () => menuAct('sound', 1), { size: 15 });
    button('quit', 'Title screen', x + 30, y + 232, w - 60, 40, () => go('title'), { size: 15 });
  }
  function drawWin(S) {
    const r = App.result || {}; g.fillStyle = 'rgba(5,4,8,0.55)'; g.fillRect(0, 0, App.W, App.H);
    const w = Math.min(460, App.W - 24), h = Math.min(380, App.H - 24), x = (App.W - w) / 2, y = (App.H - h) / 2; panel(x, y, w, h);
    const sc = h / 380;
    fitText('The Chalice is home!', App.W / 2, y + 44 * sc, 30 * sc + 4, w - 30, '#ffe39a', 'center', FONT, 'italic bold');
    text('Level ' + ROMAN[App.level] + ' \u2014 ' + World.LEVELS[App.level].name, App.W / 2, y + 80 * sc, 14, 'rgba(243,226,182,0.8)', 'center', UI);
    text(fmt(r.time), App.W / 2, y + 130 * sc, 46 * sc + 6, '#fff', 'center', UI, '800');
    if (r.record) { const p = 1 + Math.sin(App.t * 6) * 0.06; g.save(); g.translate(App.W / 2, y + 172 * sc); g.scale(p, p); text('\u2605 NEW RECORD \u2605', 0, 0, 18, '#ffcf3a', 'center', UI, '800'); g.restore(); }
    else text('best ' + fmt(r.best), App.W / 2, y + 172 * sc, 15, 'rgba(255,231,163,0.75)', 'center', UI);
    text(`dragons slain ${r.slain || 0}  \u00b7  times eaten ${r.deaths || 0}  \u00b7  bat thefts ${r.steals || 0}`, App.W / 2, y + 206 * sc, 13, 'rgba(243,226,182,0.75)', 'center', UI);
    const bw = (w - 60) / 2, by = y + h - 120 * sc;
    button('next', App.level < 4 ? 'Next: Level ' + ROMAN[App.level + 1] : 'Play again', x + 20, by, bw, 46 * sc, () => newGame(App.level < 4 ? App.level + 1 : 4), { focus: true });
    button('again', 'Replay ' + ROMAN[App.level], x + 40 + bw, by, bw, 46 * sc, () => newGame(App.level));
    button('menu', 'Title screen', x + 20, by + 56 * sc, w - 40, 38 * sc, () => go('title'), { size: 15 });
  }
  function drawTitle() {
    const W = App.W, H = App.H, L = App.L; const t = App.t; const compact = H < 520;
    const ty = L.st + (compact ? 52 : Math.min(130, H * 0.17));
    g.save(); const sz = Math.min(W * 0.14, compact ? 54 : 96);
    g.shadowColor = 'rgba(255,190,80,0.6)'; g.shadowBlur = 30; const gr = g.createLinearGradient(0, ty - sz / 2, 0, ty + sz / 2); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.5, '#f2c14e'); gr.addColorStop(1, '#a8661a');
    g.font = `bold ${sz}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = gr; g.fillText('CHALICE', W / 2, ty);
    g.shadowBlur = 0; g.lineWidth = 1.5; g.strokeStyle = 'rgba(90,50,10,0.7)'; g.strokeText('CHALICE', W / 2, ty); g.restore();
    // tiny chalice sprite crowning the title
    g.save(); g.translate(W / 2, ty - sz * 0.78); R.spriteItem(g, { kind: 'chalice', x: 0, y: 0, w: 0.85, h: 0.95, holder: 'hud' }, sz * 0.42, t); g.restore();
    text('a quest for the enchanted cup \u00b7 three castles \u00b7 three dragons \u00b7 one thieving bat', W / 2, ty + sz * 0.62, Math.max(11, Math.min(15, W / 48)), 'rgba(255,236,190,0.85)', 'center', FONT, 'italic');
    const M = MENU(); const bw = Math.min(460, W - 40), bh = compact ? 34 : 42, gap = compact ? 6 : 9; let y = ty + sz * 0.62 + (compact ? 22 : 34);
    const avail = H - L.sb - 30 - y; const need = M.length * (bh + gap); const k = need > avail ? avail / need : 1;
    M.forEach((m, i) => { const x = (W - bw) / 2; const hh = bh * k; const focus = App.focus === i && App.input !== 'touch';
      if (m.lr) { button('m-' + m.id, m.label, x + hh + 6, y, bw - (hh + 6) * 2, hh, () => menuAct(m.id, 1), { focus, size: Math.min(17, hh * 0.42), font: UI });
        button('l-' + m.id, '\u25c0', x, y, hh, hh, () => menuAct(m.id, -1), { size: hh * 0.4 }); button('r-' + m.id, '\u25b6', x + bw - hh, y, hh, hh, () => menuAct(m.id, 1), { size: hh * 0.4 }); }
      else button('m-' + m.id, m.label, x, y, bw, hh, () => menuAct(m.id, 0), { focus, size: Math.min(i === 0 ? 21 : 17, hh * 0.46), bg: i === 0 ? '#6a3f12' : null, font: i === 0 ? FONT : UI });
      y += (bh + gap) * k; });
    const best = store.get(bestKey(), null); const won = store.get('won', {});
    text((best != null ? 'Best time for this level & switches: ' + fmt(best) : 'No best time yet for this level & switches') + (won[App.level] ? '  \u2714' : ''), W / 2, Math.min(H - L.sb - 14, y + 8), 12, 'rgba(255,236,190,0.7)', 'center', UI);
    if (!isTouch() && H > 560) text('\u2191\u2193 choose \u00b7 \u2190\u2192 change \u00b7 Enter select \u00b7 gamepad & touch supported', W / 2, H - L.sb - 12, 11, 'rgba(255,236,190,0.45)', 'center', UI);
  }
  const HELP = [
    { t: 'The Quest', lines: ['An evil magician has stolen the enchanted Chalice and hidden it in the kingdom.', 'Find it and carry it home into the hall of the Gold Castle.', 'You can carry one thing at a time: walk into an item to pick it up.', 'Keys open the castle of their colour. Touch the gate with the key.', 'Level III hides every treasure somewhere new. Level IV adds a Jade Castle.'] },
    { t: 'Dragons & the Bat', lines: ['Yorgrim (yellow) guards keys and flees the Gold Key. Grumbald (green) is stubborn.', 'Rhindra (red) is fast and relentless, but pants after a long chase.', 'Strike a dragon with the Sword\u2019s blade to slay it. If you are eaten, rise again at home.', 'The Bat steals what you hold and swaps it for something else. Grab it back!', 'A flare dazes every dragon nearby and scares the bat (10 second recharge).'] },
    { t: 'Controls', lines: ['Move: arrow keys / WASD, hold the mouse, drag on touch screens, or a gamepad stick.', 'SPACE (A, DROP): drop or swap what you carry. Also rise again after being eaten.', 'ENTER (B / X, FLARE): a dazzling flare.   M / Tab (Y): the map.   P / Esc (Start): pause.', 'Left switch A: dragons bite much faster.  Right switch A: dragons flee the Sword.', 'Rumour has it a grey dot hides deep in the Black Castle\u2019s maze\u2026'] },
  ];
  function drawHelp() {
    const W = App.W, H = App.H, L = App.L; const w = Math.min(640, W - 24), h = Math.min(420, H - L.st - L.sb - 24), x = (W - w) / 2, y = L.st + (H - L.st - L.sb - h) / 2; panel(x, y, w, h, 0.94);
    const pg = HELP[App.help]; const sc = Math.min(1, h / 420);
    text(pg.t, W / 2, y + 40 * sc, 28 * sc + 4, '#ffe39a', 'center', FONT, 'italic bold');
    pg.lines.forEach((ln, i) => wrap(ln, x + 30, y + (84 + i * 56) * sc, w - 60, Math.max(12, 15 * sc), 19 * sc + 2));
    text((App.help + 1) + ' / 3', W / 2, y + h - 30, 12, 'rgba(255,236,190,0.6)', 'center', UI);
    button('hprev', '\u25c0', x + 16, y + h - 50, 44, 36, () => { App.help = Math.max(0, App.help - 1); });
    button('hnext', App.help < 2 ? '\u25b6' : 'Done', x + w - 90, y + h - 50, 74, 36, () => { if (App.help < 2) App.help++; else go('title'); }, { focus: true });
  }
  function wrap(s, x, y, maxW, size, lh) { g.font = `${size}px ${UI}`; const words = s.split(' '); let line = '', yy = y; for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (g.measureText(tst).width > maxW && line) { text(line, x, yy, size, '#f3e2b6', 'left', UI); line = wd; yy += lh; } else line = tst; } if (line) text(line, x, yy, size, '#f3e2b6', 'left', UI); }
  function drawBanner() {
    const b = App.banner; if (!b || App.screen === 'title' || App.screen === 'help' || App.screen === 'map') return; const L = App.L; const a = clamp(Math.min(b.t / 0.4, (3.2 - b.t) / 0.6), 0, 1);
    g.save(); g.globalAlpha = a; const y = L.vy + L.vh * 0.14; const gr = g.createLinearGradient(L.vx, 0, L.vx + L.vw, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(10,6,2,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(L.vx, y - 26, L.vw, b.sub ? 64 : 48);
    if (b.sub) text(b.sub.toUpperCase(), L.vx + L.vw / 2, y - 10, 11, 'rgba(255,230,170,0.8)', 'center', UI, '700');
    fitText(b.title, L.vx + L.vw / 2, y + (b.sub ? 14 : 0), Math.min(30, L.vw / 18), L.vw - 40, '#ffe7a8', 'center', FONT, 'italic bold'); g.restore();
  }
  function drawToast() {
    const tt = App.toast; if (!tt || App.screen === 'title' || App.screen === 'help') return; const L = App.L; const a = clamp(Math.min(tt.t / 0.3, (tt.dur - tt.t) / 0.4), 0, 1);
    g.save(); g.globalAlpha = a; g.font = `15px ${UI}`; const w = Math.min(L.vw - 20, g.measureText(tt.text).width + 40); const x = L.vx + (L.vw - w) / 2, y = L.vy + L.vh - 52;
    g.fillStyle = 'rgba(14,10,6,0.82)'; rr(x, y, w, 36, 18); g.fill(); g.strokeStyle = 'rgba(226,185,85,0.6)'; g.lineWidth = 1; g.stroke();
    fitText(tt.text, x + w / 2, y + 18, 15, w - 24, '#fbeac0', 'center', UI); g.restore();
  }

  /* =============================== main loop =============================== */
  function frame(ts) {
    const now = ts / 1000; let dt = App.last ? now - App.last : 1 / 60; App.last = now; dt = Math.min(dt, 0.1); App.t += dt;
    try { update(dt); drawFrame(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }
  layout(); go('title');
  // test & debug hooks
  window.__chalice = {
    App, newGame, go, key: k => menuKey(k), edge, keys, buttons: () => buttons.map(b => ({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h })),
    step: n => { for (let i = 0; i < (n || 1); i++) update(1 / 60); },
    state: () => App.S && { room: App.S.room && App.S.room.id, x: App.S.player.x, y: App.S.player.y, held: App.S.player.held && App.S.player.held.id, time: App.S.time, won: App.S.won, dead: App.S.player.dead, screen: App.screen },
    teleport: (room, lx, ly) => { const S = App.S, r = S.w.rooms[room]; S.player.x = r.x0 + lx; S.player.y = r.y0 + ly; S.room = r; S.visited[room] = S.visited[room] || 0.01; },
    autoplay: on => { App.auto = on ? Bot.create(App.S) : null; },
  };
  // optional autoplay (for testing / screenshots): drives the live game with the bot
  const _update = update;
  update = function (dt) { if (App.auto && App.screen === 'play' && App.S) { const o = App.auto.think(); keys.clear(); const save = moveVector; App._bot = o; if (o.drop) edge.drop = true; if (o.flare) edge.flare = true; } _update(dt); };
  const _mv = moveVector;
  moveVector = function (pad) { if (App.auto && App._bot) return [App._bot.mx, App._bot.my]; return _mv(pad); };
  requestAnimationFrame(frame);
})();
