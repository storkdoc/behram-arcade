/* VECTOR ARMOR — main.js : app shell. Screens, input (keyboard / mouse / gamepad / touch), the fixed 60 Hz loop,
   camera + effects, the crisp HUD overlay, high scores, and the online duel (host-authoritative, guest predicts). */
(() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const TAU = Math.PI * 2, DT = Sim.DT, wd = Sim.wd, angN = Sim.angN;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now();
  const ls = (k, d) => { try { const v = localStorage.getItem('va.' + k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem('va.' + k, v); } catch (e) { } };
  const pad = (n, k) => String(Math.max(0, Math.floor(n))).padStart(k, '0');
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ---------------- canvases & renderer ---------------- */
  let glc = document.getElementById('gl');
  const hud = document.getElementById('hud'), ctx = hud.getContext('2d');
  let REN = null;
  if (!qs.has('nogl') && GLR.init(glc, { preserve: qs.has('preserve') })) REN = GLR;
  else {
    const c2 = document.createElement('canvas'); c2.id = 'gl'; c2.setAttribute('aria-hidden', 'true'); glc.replaceWith(c2); glc = c2;
    R2D.init(c2); REN = R2D;
  }
  const RR = REN.R; // renderer state
  const App = {
    screen: 'title', focus: 0, hits: [], paused: false, touch: qs.has('touch') || IS_MOBILE || matchMedia('(pointer: coarse)').matches,
    W: 1, H: 1, hd: 1, dot: 2, sa: { t: 0, r: 0, b: 0, l: 0 }, portrait: false,
    opts: {
      ctl: ls('ctl', 'simple'), pal: ls('pal', 'modern'), mouse: ls('mouse', '0') === '1', bonus: +ls('bonus', '15000'), cpu: ls('cpu', '1') === '1', quality: ls('quality', 'auto'),
    },
    level: +ls('level', '1') || 1, G: null, attract: null, mode: 'solo', me: 0,
    shake: 0, recoil: 0, dmg: 0, crack: null, crackT: 0, msg: null, msgT: 0, pops: [], overT: 0, freeze: false, t: 0,
    vs: null, code: '', initials: null, newHi: -1, sweep: 0, lastWarn: null, err: { x: 0, z: 0, h: 0 }, fps: 60,
    renderer: REN === GLR ? 'webgl2' : 'canvas2d',
  };
  RR.palette = App.opts.pal;
  function applyQuality() { if (REN !== GLR) return; const q = App.opts.quality; RR.lockTier = q !== 'auto'; if (q === 'high') GLR.setTier(3); else if (q === 'medium') GLR.setTier(2); else if (q === 'low') GLR.setTier(0); }
  applyQuality();

  function resize() {
    const cw = window.innerWidth, ch = window.innerHeight;
    const nat = Math.min(window.devicePixelRatio || 1, 3);
    let gd = nat; const cap = IS_MOBILE ? 5.0e6 : 9.5e6; if (cw * ch * gd * gd > cap) gd = Math.sqrt(cap / (cw * ch));
    const GW = Math.round(cw * gd), GH = Math.round(ch * gd);
    glc.width = GW; glc.height = GH; glc.style.width = cw + 'px'; glc.style.height = ch + 'px';
    REN.resize(GW, GH, gd);
    // the HUD always runs at the full native resolution so text and reticle stay razor sharp
    const W = Math.round(cw * nat), H = Math.round(ch * nat);
    hud.width = W; hud.height = H; hud.style.width = W / nat + 'px'; hud.style.height = H / nat + 'px';
    App.W = W; App.H = H; App.hd = nat; App.portrait = ch > cw * 1.05;
    const s = getComputedStyle(document.getElementById('safe'));
    App.sa = { t: parseFloat(s.paddingTop) * nat || 0, r: parseFloat(s.paddingRight) * nat || 0, b: parseFloat(s.paddingBottom) * nat || 0, l: parseFloat(s.paddingLeft) * nat || 0 };
    App.dot = Math.max(1, Math.round(clamp(Math.min(cw, ch * 1.6) / 260, 1.3, 3) * nat));
    ctx.imageSmoothingEnabled = false;
  }
  addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 120));
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  resize();

  /* ---------------- high scores ---------------- */
  const DEF_HI = [['ACE', 60000, 5], ['GUN', 45000, 4], ['TNK', 32000, 3], ['ED', 24000, 3], ['ZAP', 18000, 2], ['RAD', 12000, 2], ['MAX', 8000, 1], ['BOB', 5000, 1], ['SAM', 3000, 1], ['JOE', 1000, 1]];
  function hiList() { try { const l = JSON.parse(ls('hi', 'null')); if (Array.isArray(l) && l.length) return l; } catch (e) { } return DEF_HI.map(a => ({ n: a[0], s: a[1], l: a[2] })); }
  const hiScore = () => hiList()[0].s;
  const qualifies = s => s > 0 && (hiList().length < 10 || s > hiList()[9].s);
  function addHi(n, s, l) { const L = hiList(); L.push({ n, s, l, d: Date.now() }); L.sort((a, b) => b.s - a.s); const out = L.slice(0, 10); lsSet('hi', JSON.stringify(out)); return out.findIndex(e => e.n === n && e.s === s); }

  /* ---------------- worlds ---------------- */
  function makeAttract() {
    const g = Sim.newGame({ seed: 1980, level: 5 }); g.players[0].alive = false; g.players[0].lives = 0; g.spawnT = 0.5; g.saucerT = 4;
    for (let i = 0; i < 3; i++) Sim.spawnEnemy(i ? 'tank' : 'super');
    Sim.drain(); App.attract = g; App.attractH = 0;
  }
  function useWorld(g) { if (App.world !== g) { App.world = g; REN.setObstacles(g.obs); FX.clear(); } Sim.G = g; }
  makeAttract(); useWorld(App.attract);

  function startSolo(level) {
    Sound.unlock(); App.level = clamp(level || App.level, 1, 9); lsSet('level', App.level);
    App.G = Sim.newGame({ level: App.level, bonus: [App.opts.bonus, 100000], lives: 3 }); Sim.drain(); useWorld(App.G);
    App.mode = 'solo'; App.me = 0; resetFx(); go('play'); Sound.play('start'); banner('LEVEL ' + App.level, 1.6);
  }
  function resetFx() { App.crack = null; App.crackT = 0; App.dmg = 0; App.shake = 0; App.recoil = 0; App.pops = []; App.overT = 0; App.msg = null; App.err = { x: 0, z: 0, h: 0 }; FX.clear(); }
  function toTitle() {
    if (App.vs) { Net.leave(); App.vs = null; }
    App.G = null; App.paused = false; Sound.silence(); if (document.pointerLockElement) document.exitPointerLock();
    useWorld(App.attract); go('title');
  }
  function go(s) { window.MoodSticker && window.MoodSticker.screen(s); App.screen = s; App.focus = 0; App.paused = false; document.body.classList.toggle('ingame', s === 'play' || s === 'vsready'); }
  function banner(text, t, col) { App.msg = { text, col: col || null }; App.msgT = t || 1.5; }

  /* ---------------- input ---------------- */
  const keys = new Set();
  const K = c => keys.has(c);
  const touch = { stick: null, tl: null, tr: null, fire: false };
  let mouseDX = 0, mouseFire = false, padState = { fire: false, fwd: 0, turn: 0, tl: 0, tr: 0, btn: [] };
  function readInput() {
    let fwd = 0, turn = 0;
    const up = K('ArrowUp'), dn = K('ArrowDown'), lf = K('ArrowLeft') || K('KeyA'), rt = K('ArrowRight') || K('KeyD');
    if (App.opts.ctl === 'classic') {
      const L = (K('KeyW') ? 1 : 0) - (K('KeyS') ? 1 : 0), Rr = ((up || K('KeyI')) ? 1 : 0) - ((dn || K('KeyK')) ? 1 : 0);
      fwd = (L + Rr) / 2; turn = (L - Rr) / 2; turn += (rt ? 1 : 0) - (lf ? 1 : 0);
    } else {
      fwd = ((up || K('KeyW')) ? 1 : 0) - ((dn || K('KeyS')) ? 1 : 0); turn = (rt ? 1 : 0) - (lf ? 1 : 0);
    }
    // gamepad
    if (App.opts.ctl === 'classic' && (Math.abs(padState.tl) > 0.15 || Math.abs(padState.tr) > 0.15)) { fwd += (padState.tl + padState.tr) / 2; turn += (padState.tl - padState.tr) / 2; }
    else { fwd += padState.fwd; turn += padState.turn; }
    // touch
    if (touch.stick) { const s = touch.stick; fwd += s.vy; turn += s.vx; }
    if (touch.tl || touch.tr) { const L = touch.tl ? touch.tl.v : 0, Rr = touch.tr ? touch.tr.v : 0; fwd += (L + Rr) / 2; turn += (L - Rr) / 2; }
    // mouse turn (pointer lock)
    if (mouseDX) { turn += clamp(mouseDX / 9, -1.6, 1.6); mouseDX *= 0.35; if (Math.abs(mouseDX) < 0.1) mouseDX = 0; }
    const fire = K('Space') || K('ControlLeft') || K('KeyF') || touch.fire || mouseFire || padState.fire;
    return { fwd: clamp(fwd, -1, 1), turn: clamp(turn, -1, 1), fire: !!fire };
  }
  const MENU_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Tab', 'Backspace']);
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey && e.code !== 'ControlLeft') return;
    Sound.unlock();
    if (MENU_KEYS.has(e.code)) e.preventDefault();
    const fresh = !keys.has(e.code); keys.add(e.code);
    if (!fresh) return;
    if (e.code === 'KeyM') { Sound.setOn(!Sound.st.on); banner(Sound.st.on ? 'SOUND ON' : 'SOUND OFF', 1); return; }
    const sc = App.screen;
    if (sc === 'play') {
      if (e.code === 'KeyP' || e.code === 'Escape') { if (App.vs) return; App.paused = !App.paused; App.focus = 0; if (App.paused) { Sound.silence(); Sound.play('click'); } return; }
      if (App.paused) return menuKey(e);
      if (App.mode === 'solo' && App.G && App.G.phase === 'over' && App.overT < 1.6 && (e.code === 'Enter')) { App.overT = 0; return; }
      return;
    }
    if (sc === 'initials') return initialsKey(e);
    if (sc === 'code') return codeKey(e);
    if (sc === 'title' && e.code === 'Enter' && App.focus === 0) { go('select'); Sound.play('click'); return; }
    if (sc === 'select') {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { App.level = clamp(App.level + (e.code === 'ArrowLeft' ? -1 : 1), 1, 9); Sound.play('tick'); return; }
      if (/^Digit[1-9]$/.test(e.code)) { startSolo(+e.code.slice(5)); return; }
    }
    menuKey(e);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouseFire = false; touch.fire = false; touch.stick = touch.tl = touch.tr = null; if (App.screen === 'play' && !App.vs && App.G && App.G.phase !== 'over') App.paused = true; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Sound.silence(); if (App.screen === 'play' && !App.vs) App.paused = true; } });
  function menuKey(e) {
    const f = App.hits.filter(b => b.focusable); if (!f.length) return;
    if (e.code === 'ArrowDown' || e.code === 'Tab') { App.focus = (App.focus + 1) % f.length; Sound.play('tick'); }
    else if (e.code === 'ArrowUp') { App.focus = (App.focus + f.length - 1) % f.length; Sound.play('tick'); }
    else if (e.code === 'Enter' || e.code === 'Space') activate(f[App.focus]);
    else if (e.code === 'Escape' || e.code === 'Backspace') { const b = f.find(b => /^(BACK|CANCEL|MAIN MENU|QUIT)/.test(b.label)); if (b) activate(b); }
  }
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function initialsKey(e) {
    const I = App.initials, c = e.code;
    if (/^Key[A-Z]$/.test(c) && I.i < 3) { I.s[I.i] = c.slice(3); I.i++; Sound.play('tick'); }
    else if (c === 'ArrowUp' || c === 'ArrowDown') { const j = Math.min(2, I.i), k = LET.indexOf(I.s[j]); I.s[j] = LET[(k + (c === 'ArrowUp' ? 1 : 25)) % 26]; }
    else if (c === 'ArrowRight') I.i = Math.min(3, I.i + 1); else if (c === 'ArrowLeft' || c === 'Backspace') I.i = Math.max(0, I.i - 1);
    else if (c === 'Enter') saveInitials();
  }
  function saveInitials() { App.newHi = addHi(App.initials.s.join(''), App.G.players[0].score, App.G.level); go('scores'); Sound.play('extra'); }
  function codeKey(e) {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c) && Net.ALPH.includes(c.slice(3)) && App.code.length < 5) { App.code += c.slice(3); Sound.play('tick'); }
    else if (c === 'Backspace') App.code = App.code.slice(0, -1);
    else if (c === 'Enter' && App.code.length === 5) joinCode(App.code);
    else if (c === 'Escape') toTitle();
  }
  // gamepad polling (edge-detected for menus)
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let p = null;
    for (const g of pads) if (g && g.connected) { p = g; break; }
    const old = padState.btn; padState = { fire: false, fwd: 0, turn: 0, tl: 0, tr: 0, btn: [] };
    if (!p) return;
    const dz = v => Math.abs(v) < 0.16 ? 0 : v, b = i => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
    padState.btn = p.buttons.map((x, i) => b(i));
    padState.turn = dz(p.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    padState.fwd = -dz(p.axes[1] || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
    padState.tl = -dz(p.axes[1] || 0); padState.tr = -dz(p.axes[3] || 0);
    padState.fire = b(0) || b(7) || b(5) || b(6);
    const edge = i => padState.btn[i] && !old[i];
    const fake = code => { Sound.unlock(); const ev = { code, preventDefault() { } }; if (App.screen === 'play' && !App.paused) return; if (App.screen === 'initials') return initialsKey(ev); menuKey(ev); };
    if (edge(9)) { if (App.screen === 'play' && !App.vs) App.paused = !App.paused; else fake('Enter'); }
    if (App.screen !== 'play' || App.paused) { if (edge(12)) fake('ArrowUp'); if (edge(13)) fake('ArrowDown'); if (edge(0)) fake('Enter'); if (edge(1)) fake('Escape'); if (App.screen === 'select') { if (edge(14)) App.level = Math.max(1, App.level - 1); if (edge(15)) App.level = Math.min(9, App.level + 1); } }
  }
  /* ---- pointer: menus, touch controls, mouse aim ---- */
  const ptrs = new Map();
  const inR = (b, x, y, m) => b && x >= b.x - (m || 0) && x <= b.x + b.w + (m || 0) && y >= b.y - (m || 0) && y <= b.y + b.h + (m || 0);
  const inC = (c, x, y, k) => c && Math.hypot(x - c.cx, y - c.cy) <= c.r * (k || 1);
  const playing = () => App.screen === 'play' && !App.paused;
  function ptrDown(e) {
    Sound.unlock();
    const x = e.clientX * App.hd, y = e.clientY * App.hd;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') App.touch = true;
    let role = 'ui';
    const TC = App.tc;
    if (playing()) {
      if (TC && (e.pointerType !== 'mouse' || qs.has('touch'))) {
        if (inR(TC.pause, x, y, App.dot * 2) && !App.vs) { App.paused = true; Sound.silence(); role = 'none'; }
        else if (inR(TC.mute, x, y, App.dot * 2)) { Sound.setOn(!Sound.st.on); role = 'none'; }
        else if (TC.fires.some(f => inC(f, x, y, 1.3))) { role = 'fire'; }
        else if (App.opts.ctl === 'classic') { role = x < App.W / 2 ? 'tl' : 'tr'; }
        else if (x < App.W * 0.55) role = 'stick';
        else role = 'fire';
      } else if (e.pointerType === 'mouse') {
        if (App.opts.mouse && !document.pointerLockElement && hud.requestPointerLock) { try { hud.requestPointerLock(); } catch (er) { } }
        mouseFire = true; role = 'mouse';
      }
    }
    if (role === 'ui') {
      const b = [...App.hits].reverse().find(b => inR(b, x, y, App.dot));
      if (b) { role = 'btn'; ptrs.set(e.pointerId, { x, y, role, b }); e.preventDefault(); return; }
      if (App.screen === 'play' && App.G && App.G.phase === 'over' && !App.vs) App.overT = Math.min(App.overT, 0.01);
    }
    const p = { x, y, x0: x, y0: y, role }; ptrs.set(e.pointerId, p);
    if (role === 'stick') touch.stick = { x0: x, y0: y, x, y, vx: 0, vy: 0, id: e.pointerId };
    if (role === 'tl' || role === 'tr') touch[role] = { x0: x, y0: y, y, v: 0, id: e.pointerId };
    updFire();
    if (e.pointerType !== 'mouse') e.preventDefault();
  }
  function updFire() { touch.fire = [...ptrs.values()].some(p => p.role === 'fire'); }
  function ptrMove(e) {
    if (document.pointerLockElement === hud && playing()) mouseDX += e.movementX || 0;
    const p = ptrs.get(e.pointerId); if (!p) return;
    p.x = e.clientX * App.hd; p.y = e.clientY * App.hd;
    const R0 = App.tc ? App.tc.stickR : 100;
    if (p.role === 'stick' && touch.stick) { const s = touch.stick; let dx = p.x - s.x0, dy = p.y - s.y0; const d = Math.hypot(dx, dy); if (d > R0) { s.x0 += dx / d * (d - R0); s.y0 += dy / d * (d - R0); dx = p.x - s.x0; dy = p.y - s.y0; } s.x = p.x; s.y = p.y; const dz = v => Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88; s.vx = dz(dx / R0); s.vy = dz(-dy / R0); }
    if ((p.role === 'tl' || p.role === 'tr') && touch[p.role]) { const t = touch[p.role], TR = App.tc ? App.tc.trackH * 0.42 : 150; let dy = t.y0 - p.y; if (Math.abs(dy) > TR) { t.y0 -= (Math.abs(dy) - TR) * Math.sign(dy) * -1; dy = t.y0 - p.y; } t.y = p.y; t.v = clamp(dy / TR, -1, 1); if (Math.abs(t.v) < 0.1) t.v = 0; }
  }
  function ptrUp(e) {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (!p) return;
    if (p.role === 'btn') { const x = e.clientX * App.hd, y = e.clientY * App.hd; if (inR(p.b, x, y, App.dot * 3) || e.type === 'pointerup' && Math.hypot(x - p.x, y - p.y) < App.dot * 6) activate(p.b); }
    if (p.role === 'stick') touch.stick = null;
    if (p.role === 'tl' || p.role === 'tr') touch[p.role] = null;
    if (p.role === 'mouse') mouseFire = false;
    updFire();
  }
  hud.addEventListener('pointerdown', ptrDown, { passive: false });
  addEventListener('pointermove', ptrMove); addEventListener('pointerup', ptrUp); addEventListener('pointercancel', e => { const p = ptrs.get(e.pointerId); if (p) p.role = p.role === 'btn' ? 'none' : p.role; ptrUp(e); });
  hud.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  hud.addEventListener('contextmenu', e => e.preventDefault());
  function activate(b) { if (!b) return; Sound.unlock(); Sound.play('click'); if (b.fn) b.fn(); }

  /* ---------------- events -> effects & sound ---------------- */
  const pal = () => (GLR.PAL[RR.palette] || GLR.PAL.modern);
  const colOf = type => (pal()[type] || pal().tank).line;
  const meP = () => App.world && App.world.players[App.me];
  function distTo(x, z) { const p = App.camPos || { x: 700, z: 700 }; return Math.hypot(wd(x - p.x), wd(z - p.z)); }
  const vol = d => clamp(1.1 - d / 420, 0.08, 1);
  function handleEvents(evs, myPid, quiet) {
    const g = App.world;
    for (const e of evs) {
      switch (e.t) {
        case 'fire': {
          const mine = e.owner === 'p' + myPid;
          if (mine) { if (App.vs && App.vs.role === 'guest' && now() - App.vs.predFire < 500) break; myMuzzle(); }
          else { FX.muzzle(e.x, 2.4, e.z, Math.sin(e.h), -Math.cos(e.h), [2.8, 1.0, 0.4]); if (!quiet) Sound.play('enemyFire', vol(distTo(e.x, e.z))); }
          break;
        }
        case 'fizz': FX.sparks(e.x, e.y || 1.7, e.z, [1.5, 1.2, 0.8], 10, 12, 0.5, 0.4); break;
        case 'hitObs': FX.impact(e.x, e.y || 1.7, e.z, e.kind === 'player' ? pal().shellP : pal().shellE); if (!quiet) Sound.play('hitObs', vol(distTo(e.x, e.z))); break;
        case 'kill': {
          const M = Models.M[e.type], big = e.type === 'super' || e.type === 'saucer';
          FX.explosion(e.x, e.y || 0, e.z, colOf(e.type), big, M, e.h);
          if (!quiet) { Sound.play(e.type === 'saucer' ? 'saucerHit' : big ? 'bigBoom' : 'boom', vol(distTo(e.x, e.z))); }
          if (e.by === myPid && !quiet) { App.pops.push({ text: '+' + e.pts, t: 1.6, x: e.x, z: e.z, y: (e.y || 0) + 7 }); App.shake = Math.max(App.shake, 0.25); }
          break;
        }
        case 'boom': FX.explosion(e.x, e.y || 2, e.z, colOf('missile'), false, Models.M.missile, 0); if (!quiet) Sound.play('boom', vol(distTo(e.x, e.z))); break;
        case 'die': {
          if (e.pid === myPid && !quiet) {
            App.crack = HUD.makeCrack(App.W, App.H, (Math.random() * 1e9) | 0); App.crackT = 0; App.dmg = 1; App.shake = 1.4; App.recoil = 0;
            Sound.play('crack'); Sound.play('bigBoom', 1); Sound.engine(0, false);
            const p = g.players[myPid]; FX.sparks(p.x + Math.sin(p.h) * 6, 2.2, p.z - Math.cos(p.h) * 6, [2.6, 1.6, 0.6], 60, 30, 1.2, 0.7);
          } else if (g.mode === 'duel') {
            const p = g.players[e.pid]; FX.explosion(e.x, 0, e.z, colOf('rival'), true, Models.M.tank, p ? p.h : 0); if (!quiet) Sound.play('bigBoom', vol(distTo(e.x, e.z)));
            if (!quiet) { App.pops.push({ text: 'HIT!', t: 1.6, x: e.x, z: e.z, y: 8 }); }
          }
          break;
        }
        case 'respawn': if (e.pid === myPid && !quiet) { App.crack = null; App.dmg = 0; banner(App.vs ? 'BACK IN THE FIGHT' : 'READY', 1.2); Sound.play('go'); } break;
        case 'extra': if (!quiet && e.pid === myPid) { banner('EXTRA TANK!', 2.2, '#ffffff'); Sound.play('extra'); } break;
        case 'level': if (!quiet) { banner('LEVEL ' + e.level, 1.8); Sound.play('level'); } break;
        case 'bump': if (!quiet && e.pid === myPid) { App.bumpT = 1.4; Sound.play('bump'); App.shake = Math.max(App.shake, 0.3); } break;
        case 'hop': if (!quiet) Sound.play('hop'); break;
        case 'spawn': if (!quiet && e.type === 'saucer') banner('SAUCER SIGHTED', 1.4); break;
        case 'over': if (!quiet) { App.overT = 3.2; Sound.play('over'); Sound.silence(); } break;
        case 'duelOver': if (!quiet) { const win = e.winner === myPid; banner(win ? 'YOU WIN THE DUEL!' : 'YOUR RIVAL WINS', 3, win ? '#ffffff' : '#ff6a7a'); Sound.play(win ? 'extra' : 'over'); if (App.vs) App.vs.endT = 2.8; } break;
      }
    }
  }
  function myMuzzle() {
    const p = meP(); if (!p) return;
    const fx = Math.sin(p.h), fz = -Math.cos(p.h);
    FX.muzzle(p.x + fx * 6.6, 1.9, p.z + fz * 6.6, fx, fz, [2.6, 2.0, 1.0]);
    App.recoil = 1; App.shake = Math.max(App.shake, 0.35); Sound.play('cannon');
  }

  /* ---------------- online duel ---------------- */
  function vsNew(role) { App.vs = { role, rivalLeft: false, mineAgain: false, theirAgain: false, countdown: 0, seq: 0, hist: [], inSeq: 0, gi: { fwd: 0, turn: 0, fire: false }, giT: 0, snapT: 0, snaps: [], off: null, predFire: 0, endT: 0, result: null, lastCd: 4 }; }
  function hostOnline() { Sound.unlock(); vsNew('host'); Net.host(); go('hostwait'); }
  function joinOnline() { Sound.unlock(); vsNew('guest'); Net.joinAny(); go('connecting'); }
  function joinCode(c) { Sound.unlock(); vsNew('guest'); Net.join(c); go('connecting'); }
  function vsGo(seed, cpu) {
    const v = App.vs; if (!v) return;
    App.G = Sim.newGame({ mode: 'duel', seed, cpu, to: 5 }); Sim.drain(); App.world = null; useWorld(App.G);
    App.mode = 'duel'; App.me = v.role === 'host' ? 0 : 1; resetFx();
    Object.assign(v, { countdown: 3.4, seq: 0, hist: [], inSeq: 0, snaps: [], off: null, mineAgain: false, theirAgain: false, endT: 0, result: null, lastCd: 4, gi: { fwd: 0, turn: 0, fire: false }, giT: now() });
    go('vsready'); Sound.play('start');
  }
  function maybeRematch() { const v = App.vs; if (v && v.mineAgain && v.theirAgain && v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed, cpu: App.opts.cpu }); vsGo(seed, App.opts.cpu); } }
  Net.onMessage = m => {
    const v = App.vs; if (!v || !m) return;
    switch (m.t) {
      case 'hello': if (v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed, cpu: App.opts.cpu }); vsGo(seed, App.opts.cpu); } break;
      case 'go': if (v.role === 'guest') vsGo(m.seed, !!m.cpu); break;
      case 'i': if (v.role === 'host' && m.q > v.inSeq) { v.inSeq = m.q; v.gi = { fwd: +m.f || 0, turn: +m.tn || 0, fire: !!m.fi }; v.giT = now(); } break;
      case 's': if (v.role === 'guest' && App.G) onSnap(m); break;
      case 'ev': if (v.role === 'guest' && App.G) handleEvents(m.l.filter(e => !(e.t === 'bump')), 1); break;
      case 'again': v.theirAgain = true; maybeRematch(); break;
    }
  };
  const r2 = n => Math.round(n * 100) / 100;
  function snapshot() {
    const g = App.G;
    return { t: 's', q: g.tick, tm: r2(g.t), ack: App.vs.inSeq, ph: g.phase,
      p: g.players.map(p => [r2(p.x), r2(p.z), r2(p.h), r2(p.v), r2(p.w), p.alive ? 1 : 0, p.hits, p.score, r2(p.deadT)]),
      e: g.enemies.map(e => [e.id, e.type, r2(e.x), r2(e.z), r2(e.h), r2(e.y || 0)]),
      s: g.shells.map(s => [s.id, r2(s.x), r2(s.z), r2(s.y), s.kind, s.owner]) };
  }
  function onSnap(m) {
    const v = App.vs, g = App.G, at = now() / 1000;
    const off = at - m.tm; v.off = v.off == null ? off : Math.min(v.off + 0.0005, off); // drift-tolerant min offset
    v.snaps.push({ tm: m.tm, m }); if (v.snaps.length > 40) v.snaps.shift();
    // reconcile my predicted tank against the authoritative state, replaying inputs the host hasn't seen
    const me = g.players[1], sp = m.p[1]; me.hits = sp[6]; me.score = sp[7]; me.deadT = sp[8]; g.players[0].hits = m.p[0][6]; g.players[0].score = m.p[0][7];
    v.hist = v.hist.filter(h => h.q > m.ack);
    const wasAlive = me.alive; me.alive = !!sp[5];
    if (!me.alive) { me.x = me.px = sp[0]; me.z = me.pz = sp[1]; me.h = me.ph = sp[2]; me.v = 0; me.w = 0; return; }
    const ox = me.x, oz = me.z, oh = me.h;
    me.x = sp[0]; me.z = sp[1]; me.h = sp[2]; me.v = sp[3]; me.w = sp[4];
    const others = guestOthers();
    const ev = Sim.drain(), opx = me.px, opz = me.pz;
    for (const h of v.hist) Sim.movePlayer(g, me, h.inp, others);
    Sim.drain(); for (const e of ev) Sim.emit(e);
    const ex = wd(ox - me.x), ez = wd(oz - me.z), eh = angN(oh - me.h);
    if (!wasAlive || Math.hypot(ex, ez) > 12) { App.err = { x: 0, z: 0, h: 0 }; me.px = me.x; me.pz = me.z; me.ph = me.h; }
    else { App.err.x += ex; App.err.z += ez; App.err.h += eh; me.px = Sim.wrap(me.x - wd(ox - opx)); me.pz = Sim.wrap(me.z - wd(oz - opz)); me.ph = me.h; }
    if (m.ph === 'over') g.phase = 'over';
  }
  function guestOthers() { const g = App.G; return [g.players[0]].concat(g.enemies.filter(e => e.type === 'tank' || e.type === 'super').map(e => ({ x: e.x, z: e.z, r: 4.2 }))); }
  /** guest: rebuild the remote world ~110 ms in the past from the snapshot buffer */
  function guestInterp() {
    const v = App.vs, g = App.G; if (!v.snaps.length || v.off == null) return;
    const rt = now() / 1000 - v.off - 0.11;
    let a = v.snaps[0], b = v.snaps[v.snaps.length - 1];
    for (let i = 0; i < v.snaps.length - 1; i++) if (v.snaps[i].tm <= rt && v.snaps[i + 1].tm >= rt) { a = v.snaps[i]; b = v.snaps[i + 1]; break; }
    if (rt > b.tm) a = b;
    const k = b.tm > a.tm ? clamp((rt - a.tm) / (b.tm - a.tm), 0, 1) : 1;
    const L = (p, q) => p + wd(q - p) * k, LH = (p, q) => p + angN(q - p) * k;
    const A = a.m, B = b.m, rv = g.players[0], pa = A.p[0], pb = B.p[0];
    rv.px = rv.x; rv.pz = rv.z; rv.ph = rv.h;
    rv.x = Sim.wrap(L(pa[0], pb[0])); rv.z = Sim.wrap(L(pa[1], pb[1])); rv.h = LH(pa[2], pb[2]); rv.v = pb[3]; rv.alive = !!pb[5];
    const ea = new Map(A.e.map(e => [e[0], e])), sa = new Map(A.s.map(s => [s[0], s]));
    g.enemies = B.e.map(e => { const o = ea.get(e[0]) || e; return { id: e[0], type: e[1], x: Sim.wrap(L(o[2], e[2])), z: Sim.wrap(L(o[3], e[3])), h: LH(o[4], e[4]), y: o[5] + (e[5] - o[5]) * k, alive: true, spin: 0 }; });
    g.shells = B.s.map(s => { const o = sa.get(s[0]) || s; return { id: s[0], x: Sim.wrap(L(o[1], s[1])), z: Sim.wrap(L(o[2], s[2])), y: s[3], kind: s[4], owner: s[5] }; });
  }

  /* ---------------- the fixed-step tick ---------------- */
  function tick() {
    App.t += DT;
    const sc = App.screen, v = App.vs;
    if (v && Net.st.status === 'error' && (sc === 'play' || sc === 'vsready' || sc === 'vsend') && !v.rivalLeft) { v.rivalLeft = true; Sound.silence(); if (sc !== 'vsend') go('vsend'); }
    if (sc === 'hostwait' && Net.st.status === 'error') go('neterr');
    if (sc === 'connecting') { if (Net.st.status === 'nogame') go('nogame'); else if (Net.st.status === 'error') go('neterr'); }
    if (sc === 'play' && App.G) {
      if (App.paused) return;
      if (App.mode === 'solo') soloTick();
      else if (v && v.role === 'host') hostTick();
      else if (v) guestTick();
      return;
    }
    if (sc === 'vsready' && v) {
      v.countdown -= DT; const c = Math.ceil(v.countdown);
      if (c !== v.lastCd && c > 0 && c <= 3) { v.lastCd = c; Sound.play('count'); }
      if (v.countdown <= 0) { go('play'); Sound.play('go'); banner('GO!', 1); }
      return;
    }
    if (sc === 'vsend' || App.G) return;
    // attract mode behind the menus
    const g = App.attract; Sim.G = g; Sim.step(); handleEvents(Sim.drain(), -1, true);
    if (g.enemies.length < 3) Sim.spawnEnemy(g.enemies.length % 2 ? 'tank' : 'super'), Sim.drain();
    App.attractH += DT * 0.06;
  }
  function soloTick() {
    const g = App.G; Sim.G = g; const p = g.players[0];
    p.inp = g.phase === 'play' ? readInput() : { fwd: 0, turn: 0, fire: false };
    Sim.step(); handleEvents(Sim.drain(), 0);
    if (g.phase === 'over' && App.overT > 0) { App.overT -= DT; if (App.overT <= 0) endSolo(); }
  }
  function endSolo() {
    const g = App.G; Sound.silence(); if (document.pointerLockElement) document.exitPointerLock();
    if (qualifies(g.players[0].score)) { App.initials = { s: ['A', 'A', 'A'], i: 0 }; go('initials'); }
    else { App.newHi = -1; go('over'); }
  }
  function hostTick() {
    const g = App.G, v = App.vs; Sim.G = g;
    g.players[0].inp = g.players[0].alive ? readInput() : { fwd: 0, turn: 0, fire: false };
    g.players[1].inp = now() - v.giT < 500 ? v.gi : { fwd: 0, turn: 0, fire: false };
    Sim.step(); const evs = Sim.drain(); handleEvents(evs, 0);
    if (evs.length) Net.send({ t: 'ev', l: evs.map(e => { const o = Object.assign({}, e); for (const k in o) if (typeof o[k] === 'number') o[k] = r2(o[k]); return o; }) });
    v.snapT -= DT; if (v.snapT <= 0) { v.snapT = 1 / 30 - 1e-6; Net.sendFast(snapshot()); }
    if (v.endT > 0) { v.endT -= DT; if (v.endT <= 0) { Net.sendFast(snapshot()); finishDuel(); } }
  }
  function guestTick() {
    const g = App.G, v = App.vs; Sim.G = g; const me = g.players[1];
    const inp = me.alive && g.phase !== 'over' ? readInput() : { fwd: 0, turn: 0, fire: false };
    v.seq++; v.hist.push({ q: v.seq, inp }); if (v.hist.length > 240) v.hist.shift();
    Net.sendFast({ t: 'i', q: v.seq, f: r2(inp.fwd), tn: r2(inp.turn), fi: inp.fire ? 1 : 0 });
    guestInterp();
    if (me.alive) {
      Sim.movePlayer(g, me, inp, guestOthers());
      // predicted muzzle flash: the host will fire the instant it sees this input if we have no live shell
      if (inp.fire && !g.shells.some(s => s.owner === 'p1') && now() - v.predFire > 450) { v.predFire = now(); myMuzzle(); }
    }
    handleEvents(Sim.drain().filter(e => e.t === 'bump'), 1);
    g.t += DT;
    if (v.endT > 0) { v.endT -= DT; if (v.endT <= 0) finishDuel(); }
  }
  function finishDuel() { const g = App.G, v = App.vs; v.result = { me: g.players[App.me].hits, them: g.players[1 - App.me].hits }; Sound.silence(); go('vsend'); }

  /* ---------------- camera & scene ---------------- */
  function fovY() { const asp = App.W / App.H; return clamp(2 * Math.atan(Math.tan(64 * Math.PI / 360) / asp), 0.62, 1.3); }
  function interpP(p, a) { return { x: p.px + wd(p.x - p.px) * a, z: p.pz + wd(p.z - p.pz) * a, h: p.ph + angN(p.h - p.ph) * a }; }
  function scene(dt, alpha) {
    const g = App.world, inGame = !!App.G && (App.screen === 'play' || App.screen === 'vsready' || App.screen === 'vsend' || App.screen === 'initials' || App.screen === 'over');
    let cam;
    if (inGame) {
      const p = g.players[App.me], ip = interpP(p, alpha);
      if (App.mode === 'duel' && App.me === 1) { ip.x += App.err.x; ip.z += App.err.z; ip.h += App.err.h; const k = Math.exp(-dt * 10); App.err.x *= k; App.err.z *= k; App.err.h *= k; }
      const rc = App.recoil, sh = App.shake * App.shake;
      const bob = Math.sin(App.t * 13) * 0.05 * Math.min(1, Math.abs(p.v) / 20);
      cam = { x: ip.x - Math.sin(ip.h) * rc * 0.5, y: Sim.C.EYE + bob + (p.alive ? 0 : -0.9), z: ip.z + Math.cos(ip.h) * rc * 0.5, h: ip.h + (Math.random() - 0.5) * sh * 0.03, pitch: rc * 0.035 + (Math.random() - 0.5) * sh * 0.035 + (p.alive ? 0 : -0.08) - p.v / Sim.C.P_SPD * 0.004, roll: (Math.random() - 0.5) * sh * 0.04 - p.w * 0.012 };
    } else {
      cam = { x: 700 + Math.sin(App.attractH * 0.7) * 60, y: 4.2, z: 700 + Math.cos(App.attractH * 0.5) * 60, h: App.attractH, pitch: 0.0, roll: 0 };
    }
    App.camPos = cam;
    const ents = [], t = App.t;
    for (const e of g.enemies) {
      const x = e.px != null ? e.px + wd(e.x - e.px) * alpha : e.x, z = e.pz != null ? e.pz + wd(e.z - e.pz) * alpha : e.z;
      const h = e.ph != null ? e.ph + angN(e.h - e.ph) * alpha : e.h, y = e.py != null ? e.py + ((e.y || 0) - e.py) * alpha : (e.y || 0);
      ents.push({ type: e.type, x, z, y, h, spin: e.type === 'tank' ? t * 2.6 + e.id : e.type === 'saucer' ? t * 2.2 : e.type === 'missile' ? t * 7 : 0 });
    }
    if (g.mode === 'duel') { const o = g.players[1 - App.me]; if (o.alive) { const ip = interpP(o, App.me === 1 ? 1 : alpha); ents.push({ type: 'rival', x: ip.x, z: ip.z, y: 0, h: ip.h }); } }
    const shells = [], live = new Set();
    for (const s of g.shells) {
      const x = s.px != null && App.me === 0 ? s.px + wd(s.x - s.px) * alpha : s.x, z = s.pz != null && App.me === 0 ? s.pz + wd(s.z - s.pz) * alpha : s.z;
      shells.push({ id: s.id, x, y: s.y || 1.7, z, kind: s.kind }); live.add(s.id);
      FX.trail(s.id, x, s.y || 1.7, z, s.kind === 'player' ? pal().shellP : pal().shellE);
    }
    FX.endTrails(live);
    const sc = { cam, fovY: fovY(), t, dt, ents, shells, dmg: App.dmg, bloomK: 1, expo: 1 };
    if (!inGame && (App.screen === 'title') && REN === GLR) {
      const f = sc.fovY, d = 62, hh = d * Math.tan(f / 2), hw = hh * App.W / App.H;
      const s = Math.min(0.86 * 2 * hw / 71, 0.15 * 2 * hh / 7.35);
      sc.logo = { a: 1, t, s, y: (App.portrait ? 0.62 : 0.6) * hh - 1.7 };
    }
    return sc;
  }

  /* ---------------- HUD & screens (2D) ---------------- */
  const CL = { white: '#f2f8ff', dim: '#8aa0c0', cyan: '#5ff2ff', green: '#62ff9a', red: '#ff5a6e', gold: '#ffd24a', pink: '#ff7ad0' };
  const HC = () => HUD.COL[RR.palette] || HUD.COL.modern;
  const sh = 'rgba(0,0,0,0.7)';
  function T(s, x, y, dot, col, align) { return Font.draw(ctx, s, Math.round(x), Math.round(y), Math.max(1, Math.round(dot)), col, align || 'left', sh); }
  const TW = (s, dot) => Font.width(s, Math.max(1, Math.round(dot)));
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function button(label, x, y, w, h, fn, o) {
    o = o || {};
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const idx = App.hits.filter(b => b.focusable).length, foc = idx === App.focus && !App.touch;
    App.hits.push({ label, x, y, w, h, fn, focusable: true });
    const d = App.dot, accent = o.col || (RR.palette === 'classic' ? '#4dff74' : '#5ff2ff');
    rr(x, y, w, h, Math.max(2, d)); ctx.fillStyle = foc ? 'rgba(95,242,255,0.16)' : 'rgba(4,10,22,0.74)'; ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(d * (foc ? 0.5 : 0.3))); ctx.strokeStyle = foc ? accent : 'rgba(140,190,255,0.45)'; ctx.stroke();
    let dot = o.dot || d; while (dot > 1 && TW(label, dot) > w - d * 4) dot--;
    T(label, x + w / 2, y + Math.round((h - 7 * dot) / 2), dot, foc ? '#ffffff' : (o.tc || '#d7e9ff'), 'center');
    if (foc) T('▶', x - d * 2, y + Math.round((h - 7 * dot) / 2), dot, accent, 'right');
  }
  /** vertical stack of buttons that fits between y0 and y1 */
  function menu(items, y0, y1, wMax) {
    const d = App.dot, n = items.length, gap = Math.round(d * 2.5);
    const bh = Math.round(clamp((y1 - y0 - gap * (n - 1)) / n, d * 9, d * 13));
    const bw = Math.round(Math.min(App.W - App.sa.l - App.sa.r - d * 12, wMax || d * 6 * 38));
    const total = n * bh + (n - 1) * gap; let y = Math.round(y0 + Math.max(0, (y1 - y0 - total) / 2));
    for (const it of items) { if (it) button(it[0], (App.W - bw) / 2, y, bw, bh, it[1], it[2]); y += bh + gap; }
    return y;
  }
  function wrapText(s, maxW, dot) { return Font.wrap ? Font.wrap(s, Math.floor(maxW / (6 * dot))) : [s]; }
  function para(s, y, dot, col, maxW) { const lines = wrapText(s, maxW || App.W * 0.86, dot); for (const l of lines) { T(l, App.W / 2, y, dot, col, 'center'); y += Math.round(dot * 10); } return y; }
  function title(s, y, col) { const d = App.dot * 2; let dd = d; while (dd > 1 && TW(s, dd) > App.W * 0.9) dd--; T(s, App.W / 2, y, dd, col || CL.cyan, 'center'); return y + dd * 11; }
  const top = () => App.sa.t + App.dot * 6, bottom = () => App.H - App.sa.b - App.dot * 4;

  function drawScreen() {
    const d = App.dot, W = App.W, H = App.H, sc = App.screen, v = App.vs;
    App.hits = [];
    // dim the 3D world behind menus a touch for legibility
    if (sc !== 'title' && sc !== 'play' && sc !== 'vsready') { ctx.fillStyle = 'rgba(0,0,6,0.55)'; ctx.fillRect(0, 0, W, H); }
    switch (sc) {
      case 'title': {
        let y = Math.round(H * (App.portrait ? 0.08 : 0.06)) + App.sa.t;
        if (REN !== GLR) { let dd = d * 3; while (dd > 1 && TW('VECTOR ARMOR', dd) > W * 0.88) dd--; T('VECTOR ARMOR', W / 2, y + d * 4, dd, '#4dff74', 'center'); }
        const logoBottom = Math.round(H * (App.portrait ? 0.30 : 0.34));
        T('TANK COMBAT IN THE VECTOR ZONE', W / 2, logoBottom - d * 7, Math.max(1, Math.round(d * 0.75)), CL.dim, 'center');
        T('HIGH SCORE ' + pad(hiScore(), 6), W / 2, logoBottom + d * 2, d, CL.gold, 'center');
        const y1 = bottom() - d * 12;
        menu([['1 PLAYER GAME', () => go('select')], ['TWO-PLAYER GAME (ONLINE)', hostOnline], ['JOIN TWO-PLAYER GAME IN PROGRESS', joinOnline], ['HIGH SCORES', () => { App.newHi = -1; go('scores'); }], ['HOW TO PLAY', () => go('howto')], ['OPTIONS', () => go('options')]], logoBottom + d * 13, y1);
        const ds = Math.max(1, Math.round(d * 0.66));
        T(App.touch ? 'TAP A BUTTON TO BEGIN' : 'ENTER TO START  ·  ARROWS TO CHOOSE', W / 2, bottom() - d * 9, ds, CL.dim, 'center');
        T('A 1980-STYLE HOMAGE  ·  BEHRAM ARCADE', W / 2, bottom() - d * 3, ds, '#5a6c8c', 'center');
        if (REN !== GLR) T('SIMPLE WIREFRAME MODE (WEBGL2 UNAVAILABLE)', W / 2, bottom() - d * 15, ds, CL.red, 'center');
        break;
      }
      case 'select': {
        let y = title('SELECT STARTING LEVEL', top() + d * 6);
        y = para('HIGHER LEVELS: FASTER, SMARTER TANKS, SUPERTANKS AND MISSILES FROM LEVEL 2.', y + d * 2, Math.max(1, Math.round(d * 0.75)), CL.dim);
        const n = 9, cols = App.portrait ? 3 : 9, sz = Math.round(Math.min((W - App.sa.l - App.sa.r - d * 16) / cols - d * 3, d * 22)), gap = d * 3;
        const rows = Math.ceil(n / cols), gw = cols * sz + (cols - 1) * gap; let gy = y + d * 6;
        for (let i = 0; i < n; i++) {
          const c = i % cols, r = (i / cols) | 0, x = (W - gw) / 2 + c * (sz + gap), yy = gy + r * (sz + gap), lv = i + 1, sel = lv === App.level;
          App.hits.push({ label: 'LEVEL ' + lv, x, y: yy, w: sz, h: sz, fn: () => startSolo(lv), focusable: false });
          rr(x, yy, sz, sz, d); ctx.fillStyle = sel ? 'rgba(95,242,255,0.2)' : 'rgba(4,10,22,0.74)'; ctx.fill(); ctx.lineWidth = Math.max(1, Math.round(d * (sel ? 0.6 : 0.3))); ctx.strokeStyle = sel ? CL.cyan : 'rgba(140,190,255,0.45)'; ctx.stroke();
          let dd = Math.max(1, Math.round(sz / 12)); T(String(lv), x + sz / 2, yy + (sz - 7 * dd) / 2, dd, sel ? '#fff' : '#cfe6ff', 'center');
        }
        gy += rows * (sz + gap) + d * 4;
        T('BONUS TANK AT ' + App.opts.bonus + ' AND 100000', W / 2, gy, Math.max(1, Math.round(d * 0.75)), CL.gold, 'center');
        menu([['START LEVEL ' + App.level, () => startSolo(App.level)], ['BACK', toTitle]], gy + d * 8, bottom(), d * 6 * 26);
        break;
      }
      case 'scores': {
        let y = title('HIGH SCORES', top() + d * 6, CL.gold) + d * 4;
        const L = hiList(), dd = App.portrait ? Math.max(1, Math.round(d * 0.9)) : d;
        L.forEach((e, i) => { const col = i === App.newHi ? '#ffffff' : i === 0 ? CL.gold : '#bcd3f0'; T((i + 1 + '.').padStart(3, ' ') + ' ' + (e.n + '   ').slice(0, 3) + '  ' + pad(e.s, 6) + '  L' + (e.l || 1), W / 2, y, dd, col, 'center'); y += dd * 11; });
        menu(App.G && App.mode === 'solo' ? [['PLAY AGAIN', () => startSolo(App.level)], ['MAIN MENU', toTitle]] : [['BACK', toTitle]], y + d * 4, bottom(), d * 6 * 26);
        break;
      }
      case 'howto': {
        let y = title('HOW TO PLAY', top() + d * 4), dd = Math.max(1, Math.round(d * 0.8)), mw = Math.min(W * 0.9, d * 6 * 70);
        const L = App.touch ? [
          'DRAG THE LEFT STICK TO DRIVE AND TURN. HOLD FIRE TO SHOOT.',
          'CLASSIC TREAD MODE (OPTIONS): LEFT AND RIGHT THUMBS EACH DRIVE ONE TREAD.',
        ] : [
          'ARROWS: UP/DOWN DRIVE, LEFT/RIGHT TURN. SPACE FIRES. P PAUSES. M MUTES.',
          'CLASSIC TREADS (OPTIONS): W/S LEFT TREAD, UP/DOWN OR I/K RIGHT TREAD.',
          'GAMEPAD: LEFT STICK (OR BOTH STICKS AS TREADS), A OR TRIGGER FIRES.',
        ];
        for (const l of L) y = para(l, y, dd, '#d7e9ff', mw) + d * 2;
        y += d * 2;
        for (const l of ['ONE SHELL IN THE AIR AT A TIME. WATCH THE RADAR: ENEMIES ARE RED BLIPS.',
          'TANK 1000   SUPERTANK 3000   MISSILE 2000   SAUCER 5000 (IT CANNOT SHOOT BACK)',
          'OBSTACLES STOP SHELLS. MISSILES HOP OVER THEM. DODGE ENEMY SHELLS!',
          'ONLINE: ONE PLAYER PICKS TWO-PLAYER GAME, THE OTHER PICKS JOIN. FIRST TO 5 HITS WINS.']) y = para(l, y, dd, CL.dim, mw) + d * 2;
        menu([['BACK', toTitle]], y + d * 2, bottom(), d * 6 * 20);
        break;
      }
      case 'options': {
        const o = App.opts, y = title('OPTIONS', top() + d * 4);
        const set = (k, val) => { o[k] = val; lsSet(k, typeof val === 'boolean' ? (val ? '1' : '0') : val); };
        menu([
          ['CONTROLS: ' + (o.ctl === 'classic' ? 'CLASSIC TREAD' : 'SIMPLE'), () => set('ctl', o.ctl === 'classic' ? 'simple' : 'classic')],
          ['PALETTE: ' + (o.pal === 'classic' ? 'CLASSIC GREEN VECTOR' : 'MODERN'), () => { set('pal', o.pal === 'classic' ? 'modern' : 'classic'); RR.palette = o.pal; }],
          ['SOUND: ' + (Sound.st.on ? 'ON' : 'OFF'), () => Sound.setOn(!Sound.st.on)],
          ['MUSIC: ' + (Sound.st.music ? 'ON' : 'OFF'), () => Sound.setMusic(!Sound.st.music)],
          ['MOUSE AIM: ' + (o.mouse ? 'ON' : 'OFF'), () => set('mouse', !o.mouse)],
          ['BONUS TANK: ' + o.bonus, () => set('bonus', String(o.bonus === 15000 ? 25000 : o.bonus === 25000 ? 50000 : 15000)) || (o.bonus = +o.bonus)],
          ['DUEL CPU TANKS: ' + (o.cpu ? 'ON' : 'OFF'), () => set('cpu', !o.cpu)],
          ['QUALITY: ' + o.quality.toUpperCase(), () => { const q = ['auto', 'high', 'medium', 'low']; set('quality', q[(q.indexOf(o.quality) + 1) % 4]); applyQuality(); }],
          ['BACK', toTitle]], y, bottom() - d * 8, d * 6 * 34);
        o.bonus = +o.bonus;
        const info = REN === GLR ? `WEBGL2 · ${RR.samples ? RR.samples + 'X MSAA' : 'FXAA'} · ${RR.hdr ? 'HDR' : 'LDR'} · TIER ${RR.tier} · ${RR.W}X${RR.H}` : 'CANVAS 2D WIREFRAME';
        T(info, W / 2, bottom() - d * 4, Math.max(1, Math.round(d * 0.6)), '#5a6c8c', 'center');
        break;
      }
      case 'over': {
        const g = App.G, p = g.players[0]; let y = title('GAME OVER', top() + d * 10, CL.red);
        T('SCORE ' + pad(p.score, 6), W / 2, y + d * 4, d * 1.5, '#fff', 'center');
        T('REACHED LEVEL ' + g.level + '  ·  ' + g.kills + ' KILLS', W / 2, y + d * 20, d, CL.dim, 'center');
        menu([['PLAY AGAIN', () => startSolo(App.level)], ['HIGH SCORES', () => go('scores')], ['MAIN MENU', toTitle]], y + d * 34, bottom(), d * 6 * 24);
        break;
      }
      case 'initials': {
        const I = App.initials; let y = title('NEW HIGH SCORE!', top() + d * 4, CL.gold);
        T(pad(App.G.players[0].score, 6), W / 2, y, d * 1.5, '#fff', 'center'); y += d * 16;
        const dd = d * 3; for (let i = 0; i < 3; i++) { const x = W / 2 + (i - 1) * dd * 8; T(I.s[i], x, y, dd, i === I.i ? '#fff' : CL.cyan, 'center'); if (i === I.i && (App.t * 3 | 0) % 2) ctx.fillRect(Math.round(x - dd * 2.5), y + dd * 8, dd * 5, Math.max(1, d / 2 | 0)); }
        y += dd * 11;
        const cols = App.portrait ? 7 : 14, ks = Math.round(Math.min((W * 0.9) / cols - d * 2, d * 14)), gx = (W - cols * (ks + d * 2)) / 2;
        const keysL = LET.concat(['DEL', 'END']);
        keysL.forEach((k, i) => { const c = i % cols, r = (i / cols) | 0, x = gx + c * (ks + d * 2), yy = y + r * (ks + d * 2); App.hits.push({ label: k, x, y: yy, w: ks, h: ks, fn: () => { if (k === 'DEL') I.i = Math.max(0, I.i - 1); else if (k === 'END') saveInitials(); else if (I.i < 3) { I.s[I.i] = k; I.i++; } }, focusable: false });
          rr(x, yy, ks, ks, d); ctx.fillStyle = 'rgba(4,10,22,0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(140,190,255,0.5)'; ctx.lineWidth = Math.max(1, d / 3 | 0); ctx.stroke(); let kd = Math.max(1, Math.round(ks / 14)); while (kd > 1 && TW(k, kd) > ks - d) kd--; T(k, x + ks / 2, yy + (ks - 7 * kd) / 2, kd, '#d7e9ff', 'center'); });
        y += Math.ceil(keysL.length / cols) * (ks + d * 2) + d * 3;
        T(App.touch ? 'TAP LETTERS, THEN END' : 'TYPE YOUR INITIALS, THEN ENTER', W / 2, y, Math.max(1, Math.round(d * 0.75)), CL.dim, 'center');
        break;
      }
      case 'hostwait': {
        let y = title('TWO-PLAYER GAME (ONLINE)', top() + d * 6), mw = Math.min(W * 0.88, d * 6 * 56);
        y = para('CALL YOUR BUDDY AND TELL THEM TO HOP ON THEIR BIKE AND HEAD OVER. THE GAME IS LOADING… JUST LIKE THE OLD DAYS.', y + d * 4, d, '#ffffff', mw);
        y = para('THEY PICK "JOIN TWO-PLAYER GAME IN PROGRESS" ON THEIR OWN DEVICE. NO CODE NEEDED.', y + d * 4, Math.max(1, Math.round(d * 0.75)), CL.dim, mw);
        const st = Net.st, dots = '.'.repeat(1 + ((App.t * 2) | 0) % 3);
        T(st.status === 'waiting' ? 'WAITING FOR YOUR BUDDY' + dots : 'OPENING THE GAME' + dots, W / 2, y + d * 6, d, CL.green, 'center');
        T('BACKUP CODE', W / 2, y + d * 20, Math.max(1, Math.round(d * 0.75)), CL.dim, 'center');
        T(st.code || '-----', W / 2, y + d * 30, d * 3, CL.gold, 'center');
        menu([['CANCEL', toTitle]], y + d * 58, bottom(), d * 6 * 18);
        break;
      }
      case 'connecting': {
        let y = title('JOIN TWO-PLAYER GAME', top() + d * 8);
        const st = Net.st, dots = '.'.repeat(1 + ((App.t * 2) | 0) % 3);
        y = para(st.status === 'connected' ? 'CONNECTED! STARTING' + dots : st.via === 'code' ? 'LOOKING FOR GAME ' + st.code + dots : 'LOOKING FOR A GAME IN PROGRESS' + dots, y + d * 6, d, CL.green);
        menu([['CANCEL', toTitle]], y + d * 10, bottom(), d * 6 * 18);
        break;
      }
      case 'nogame': {
        let y = title('NO GAME WAITING', top() + d * 8, CL.gold);
        y = para(Net.st.error || 'NOBODY HAS STARTED A TWO-PLAYER GAME YET. ASK YOUR BUDDY TO PICK "TWO-PLAYER GAME (ONLINE)" FIRST.', y + d * 4, d, '#fff', Math.min(W * 0.88, d * 6 * 56));
        menu([['RETRY', joinOnline], ['ENTER CODE INSTEAD', () => { App.code = ''; go('code'); }], ['BACK', toTitle]], y + d * 8, bottom(), d * 6 * 26);
        break;
      }
      case 'code': {
        let y = title('ENTER BACKUP CODE', top() + d * 4);
        T((App.code + '_____').slice(0, 5), W / 2, y, d * 3, CL.gold, 'center'); y += d * 30;
        const A = Net.ALPH.split ? Net.ALPH.split('') : Array.from(Net.ALPH), cols = App.portrait ? 6 : 12, ks = Math.round(Math.min(W * 0.9 / cols - d * 2, d * 14)), gx = (W - cols * (ks + d * 2)) / 2;
        A.forEach((k, i) => { const c = i % cols, r = (i / cols) | 0, x = gx + c * (ks + d * 2), yy = y + r * (ks + d * 2); App.hits.push({ label: k, x, y: yy, w: ks, h: ks, fn: () => { if (App.code.length < 5) App.code += k; }, focusable: false });
          rr(x, yy, ks, ks, d); ctx.fillStyle = 'rgba(4,10,22,0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(140,190,255,0.5)'; ctx.lineWidth = Math.max(1, d / 3 | 0); ctx.stroke(); const kd = Math.max(1, Math.round(ks / 14)); T(k, x + ks / 2, yy + (ks - 7 * kd) / 2, kd, '#d7e9ff', 'center'); });
        y += Math.ceil(A.length / cols) * (ks + d * 2) + d * 2;
        menu([[App.code.length === 5 ? 'JOIN ' + App.code : 'JOIN (5 LETTERS)', () => { if (App.code.length === 5) joinCode(App.code); }], ['DELETE', () => { App.code = App.code.slice(0, -1); }], ['BACK', toTitle]], y, bottom(), d * 6 * 24);
        break;
      }
      case 'neterr': {
        let y = title('CONNECTION PROBLEM', top() + d * 8, CL.red);
        y = para(Net.st.error || 'SOMETHING WENT WRONG.', y + d * 4, d, '#fff', Math.min(W * 0.88, d * 6 * 56));
        menu([['BACK', toTitle]], y + d * 8, bottom(), d * 6 * 18);
        break;
      }
      case 'vsend': {
        let y = top() + d * 10;
        if (v && v.rivalLeft) { y = title('YOUR BUDDY LEFT', y, CL.gold); y = para('THE CONNECTION TO YOUR BUDDY WAS CLOSED.', y + d * 4, d, CL.dim); menu([['MAIN MENU', toTitle]], y + d * 8, bottom(), d * 6 * 20); break; }
        const r = v && v.result || { me: 0, them: 0 }, win = r.me > r.them;
        y = title(win ? 'YOU WIN!' : 'YOUR RIVAL WINS', y, win ? CL.green : CL.red);
        T('YOU ' + r.me + '  ·  RIVAL ' + r.them, W / 2, y + d * 4, d * 1.5, '#fff', 'center');
        menu([[v.mineAgain ? (v.theirAgain ? 'STARTING...' : 'WAITING FOR BUDDY...') : 'REMATCH', () => { if (!v.mineAgain) { v.mineAgain = true; Net.send({ t: 'again' }); maybeRematch(); } }], ['MAIN MENU', toTitle]], y + d * 30, bottom(), d * 6 * 24);
        break;
      }
    }
  }

  /* ---- in-game HUD ---- */
  function placeTouch() {
    const W = App.W, H = App.H, sa = App.sa, m = Math.min(W, H), d = App.dot;
    const r = Math.round(m * (App.portrait ? 0.12 : 0.11)), fy = H - sa.b - r * 1.45;
    const tc = { stickR: Math.round(m * 0.12), fires: [], trackH: Math.round(Math.min(H * 0.42, m * 0.6)) };
    tc.stickHome = { cx: sa.l + m * 0.2, cy: H - sa.b - m * 0.2 };
    if (App.opts.ctl === 'classic') {
      tc.tw = Math.round(m * 0.13);
      tc.tl = { x: sa.l + m * 0.05, y: H - sa.b - m * 0.06 - tc.trackH, w: tc.tw, h: tc.trackH };
      tc.tr = { x: W - sa.r - m * 0.05 - tc.tw, y: tc.tl.y, w: tc.tw, h: tc.trackH };
      const fr = Math.round(r * 0.8);
      tc.fires = [{ cx: tc.tl.x + tc.tw + fr * 1.6, cy: H - sa.b - fr * 1.4, r: fr }, { cx: tc.tr.x - fr * 1.6, cy: H - sa.b - fr * 1.4, r: fr }];
    } else tc.fires = [{ cx: W - sa.r - r * 1.45, cy: fy, r }];
    const iw = Math.round(Math.max(d * 9, m * 0.06));
    const ty = App.portrait ? sa.t + d * 3 : sa.t + d * 3;
    tc.pause = { x: sa.l + d * 4, y: ty, w: iw, h: iw }; tc.mute = { x: sa.l + d * 6 + iw, y: ty, w: iw, h: iw };
    App.tc = tc;
  }
  function drawTouch() {
    const tc = App.tc, d = App.dot, C = HC(); if (!tc) return;
    ctx.save();
    const circ = (cx, cy, r, fill, stroke, lw) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = lw || Math.max(1, d / 2 | 0); ctx.strokeStyle = stroke; ctx.stroke(); } };
    if (App.opts.ctl === 'classic') {
      for (const k of ['tl', 'tr']) { const b = tc[k], t = touch[k]; rr(b.x, b.y, b.w, b.h, b.w / 2); ctx.fillStyle = 'rgba(10,20,40,0.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(150,220,255,0.35)'; ctx.lineWidth = Math.max(1, d / 2 | 0); ctx.stroke();
        const cy = b.y + b.h / 2 - (t ? t.v : 0) * b.h * 0.42; circ(b.x + b.w / 2, cy, b.w * 0.42, t ? 'rgba(95,242,255,0.35)' : 'rgba(150,220,255,0.16)', 'rgba(190,240,255,0.7)');
        T(k === 'tl' ? 'L' : 'R', b.x + b.w / 2, b.y - d * 9, d, 'rgba(190,240,255,0.7)', 'center'); }
    } else {
      const s = touch.stick, R0 = tc.stickR, cx = s ? s.x0 : tc.stickHome.cx, cy = s ? s.y0 : tc.stickHome.cy;
      circ(cx, cy, R0, 'rgba(10,20,40,0.3)', 'rgba(150,220,255,0.35)');
      const kx = s ? cx + s.vx * R0 * 0.88 : cx, ky = s ? cy - s.vy * R0 * 0.88 : cy;
      circ(kx, ky, R0 * 0.42, s ? 'rgba(95,242,255,0.35)' : 'rgba(150,220,255,0.14)', 'rgba(190,240,255,0.7)');
      if (!s) T('DRIVE', cx, cy + R0 + d * 3, Math.max(1, Math.round(d * 0.7)), 'rgba(190,240,255,0.55)', 'center');
    }
    for (const f of tc.fires) { circ(f.cx, f.cy, f.r, touch.fire ? 'rgba(255,90,110,0.45)' : 'rgba(255,90,110,0.18)', 'rgba(255,150,160,0.85)', Math.max(1, Math.round(d * 0.7))); T('FIRE', f.cx, f.cy - 3.5 * d, d, '#ffe0e4', 'center'); }
    const ic = (b, draw) => { rr(b.x, b.y, b.w, b.h, d); ctx.fillStyle = 'rgba(4,10,22,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(150,220,255,0.4)'; ctx.lineWidth = Math.max(1, d / 3 | 0); ctx.stroke(); draw(); };
    if (!App.vs) ic(tc.pause, () => { const b = tc.pause, w = Math.round(b.w * 0.14); ctx.fillStyle = '#d7e9ff'; ctx.fillRect(Math.round(b.x + b.w * 0.3), Math.round(b.y + b.h * 0.25), w, Math.round(b.h * 0.5)); ctx.fillRect(Math.round(b.x + b.w * 0.7 - w), Math.round(b.y + b.h * 0.25), w, Math.round(b.h * 0.5)); });
    ic(tc.mute, () => { const b = tc.mute, dd = Math.max(1, Math.round(b.w / 14)); T(Sound.st.on ? '♪' : 'X', b.x + b.w / 2, b.y + (b.h - 7 * dd) / 2, dd, Sound.st.on ? '#d7e9ff' : CL.red, 'center'); });
    ctx.restore();
  }
  function playHud(dt) {
    const g = App.world, d = App.dot, W = App.W, H = App.H, sa = App.sa, C = HC(), me = g.players[App.me];
    const ds = Math.max(1, Math.round(d * 0.75));
    // radar
    const rr0 = Math.round(Math.min(H * (App.portrait ? 0.085 : 0.115), W * (App.portrait ? 0.17 : 0.085)));
    const rcx = W / 2, rcy = sa.t + rr0 + d * 3;
    App.sweep = (App.sweep + dt * TAU / 2) % TAU;
    const blips = me.alive || App.mode === 'duel' ? Sim.radarBlips(g, App.me) : [];
    if (App.prevSweep != null && App.sweep < App.prevSweep && blips.length && App.screen === 'play') Sound.play('ping');
    App.prevSweep = App.sweep;
    HUD.radar(ctx, rcx, rcy, rr0, blips, App.sweep, RR.palette, App.hd, Sim.C.VIEW_HALF);
    App.radar = { cx: rcx, cy: rcy, r: rr0, blips };
    // warnings
    const wn = me.alive ? Sim.warnings(g, App.me) : { inRange: false, dir: null };
    if (wn.dir && wn.dir !== App.lastWarn) Sound.play('warn');
    App.lastWarn = wn.dir; App.warn = wn;
    const blink = (App.t * 2.5 | 0) % 2 === 0;
    const wx = App.portrait ? W / 2 : rcx - rr0 - d * 6, wy = App.portrait ? rcy + rr0 + d * 4 : rcy - d * 6, al = App.portrait ? 'center' : 'right';
    if (wn.inRange) T('ENEMY IN RANGE', wx, wy, ds, C.warn, al);
    if (wn.dir && blink) T('ENEMY TO ' + wn.dir, wx, wy + ds * 10, ds, C.warn, al);
    if (App.bumpT > 0) { App.bumpT -= dt; T('MOTION BLOCKED BY OBJECT', W / 2, H * 0.68, ds, C.warn, 'center'); }
    // score / lives (or duel tally)
    const sx = App.portrait ? W - sa.r - d * 4 : rcx + rr0 + d * 6, sy = App.portrait ? sa.t + d * 4 : rcy - d * 9, sal = App.portrait ? 'right' : 'left';
    if (App.mode === 'duel') {
      const o = g.players[1 - App.me];
      T('YOU ' + me.hits + '  RIVAL ' + o.hits, sx, sy, ds, C.score, sal);
      T('FIRST TO ' + g.duelTo, sx, sy + ds * 10, ds, CL.dim, sal);
      const png = Net.st.ping; T('LINK ' + (png == null ? '--' : Math.round(png)) + ' MS', sx, sy + ds * 20, ds, png != null && png > 150 ? CL.red : CL.dim, sal);
    } else {
      T('SCORE ' + pad(me.score, 6), sx, sy, ds, C.score, sal);
      T('HIGH  ' + pad(Math.max(hiScore(), me.score), 6), sx, sy + ds * 10, ds, CL.dim, sal);
      const u = Math.max(1, Math.round(ds * 0.9)), n = Math.min(8, me.lives - (me.alive ? 1 : 0));
      for (let i = 0; i < Math.max(0, n); i++) HUD.tankIcon(ctx, sal === 'left' ? sx + i * u * 12 : sx - (i + 1) * u * 12, sy + ds * 20, u, C.score);
      T('LEVEL ' + g.level, App.portrait ? sa.l + d * 4 : wx, App.portrait ? sa.t + d * 4 + (App.touch ? d * 14 : 0) : wy - ds * 10, ds, CL.dim, App.portrait ? 'left' : al);
    }
    // reticle — highlight when an enemy sits under the crosshair
    let on = false;
    if (me.alive) for (const b of blips) if (b.f > 0 && Math.abs(b.b) < 0.03 + 4 / Math.max(10, b.d) && b.d < Sim.C.SHELL_RANGE) on = true;
    if (me.alive) for (const e of g.enemies) if (e.type === 'saucer' || e.type === 'missile') { const q = Sim.rel(me, e.x, e.z); if (q.f > 0 && Math.abs(q.b) < 0.03 + 4 / Math.max(10, q.d) && q.d < Sim.C.SHELL_RANGE) on = true; }
    App.onTarget = on;
    if (me.alive) {
      const asp = W / H, f = fovY(), pitch = App.camPos ? App.camPos.pitch : 0;
      const yOff = Math.tan(-pitch) / Math.tan(f / 2) * H / 2; // keep the reticle on the gun line during recoil
      HUD.reticle(ctx, W / 2, H / 2 + yOff * 0.5, Math.min(W, H) * 0.05, on, RR.palette, App.hd);
      void asp;
    }
    // score pop-ups projected into the view
    if (App.camPos) {
      const cam = App.camPos, f = fovY(), th = Math.tan(f / 2);
      App.pops = App.pops.filter(p => (p.t -= dt) > 0);
      for (const p of App.pops) {
        const dx = wd(p.x - cam.x), dz = wd(p.z - cam.z), fw = dx * Math.sin(cam.h) - dz * Math.cos(cam.h), rt = dx * Math.cos(cam.h) + dz * Math.sin(cam.h);
        if (fw < 3) continue; p.y += dt * 3;
        const sx2 = W / 2 + rt / fw / (th * W / H) * W / 2, sy2 = H / 2 - (p.y - cam.y) / fw / th * H / 2;
        ctx.globalAlpha = Math.min(1, p.t * 1.5); T(p.text, sx2, sy2, d, '#ffffff', 'center'); ctx.globalAlpha = 1;
      }
    }
    // glass crack + damage flash
    if (App.crack) { App.crackT += dt; const a = me.alive ? Math.max(0, 1 - App.crackT * 2) : 1; HUD.crack(ctx, App.crack, a, App.hd, App.t); if (!me.alive) T(App.mode === 'duel' ? 'HIT! RESPAWNING' : 'TANK DESTROYED', W / 2, H * 0.76, d, '#ffffff', 'center'); if (a <= 0) App.crack = null; }
    // banners
    if (App.msg && App.msgT > 0) { App.msgT -= dt; ctx.globalAlpha = Math.min(1, App.msgT * 2); let dd = d * 1.25; while (dd > 1 && TW(App.msg.text, dd) > W * 0.9) dd--; T(App.msg.text, W / 2, H * 0.25, dd, App.msg.col || C.text, 'center'); ctx.globalAlpha = 1; }
    if (App.mode === 'solo' && g.phase === 'over') { T('GAME OVER', W / 2, H * 0.42, d * 2, CL.red, 'center'); }
    if (App.screen === 'vsready' && App.vs) { const c = Math.ceil(App.vs.countdown); T(c > 0 ? String(c) : 'GO!', W / 2, H * 0.36, d * 4, '#ffffff', 'center'); T('ONLINE DUEL · FIRST TO 5 HITS', W / 2, H * 0.36 + d * 34, ds, CL.dim, 'center'); }
    if (App.touch) { placeTouch(); drawTouch(); } else App.tc = null;
    if (App.paused) {
      ctx.fillStyle = 'rgba(0,0,8,0.6)'; ctx.fillRect(0, 0, W, H); App.hits = [];
      title('PAUSED', H * 0.3); menu([['RESUME', () => { App.paused = false; }], ['QUIT TO MENU', toTitle]], H * 0.42, H * 0.75, d * 6 * 22);
    }
  }

  /* ---------------- main loop ---------------- */
  let last = now(), acc = 0, alphaLast = 1;
  function render(dt) {
    const sc = scene(dt, alphaLast);
    REN.frame(sc);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, App.W, App.H);
    if ((App.screen === 'play' || App.screen === 'vsready') && App.G) { if (!App.paused) App.hits = []; playHud(dt); }
    else drawScreen();
  }
  function frame(t) {
    requestAnimationFrame(frame);
    let dt = (t - last) / 1000; last = t; if (!(dt > 0)) dt = 0.016; dt = Math.min(dt, 0.1);
    pollPad();
    if (!App.freeze) {
      acc += dt; let n = 0; while (acc >= DT && n < 8) { tick(); acc -= DT; n++; } if (n >= 8) acc = 0;
      alphaLast = acc / DT;
      if (!App.paused) FX.update(dt);
      App.shake *= Math.exp(-dt * 5); App.recoil *= Math.exp(-dt * 7); App.dmg *= Math.exp(-dt * 1.6);
    }
    // continuous sounds
    const g = App.world, me = App.G ? g.players[App.me] : null, live = App.screen === 'play' && !App.paused && me && me.alive;
    Sound.engine(live ? Math.abs(me.v) / Sim.C.P_SPD : 0, !!live);
    if (live) { let sv = 0, mv = 0; for (const e of g.enemies) { const dd = distTo(e.x, e.z); if (e.type === 'saucer') sv = Math.max(sv, vol(dd)); if (e.type === 'missile') mv = Math.max(mv, vol(dd)); } Sound.saucer(sv * 0.7); Sound.missile(mv * 0.6, 1); }
    else if (App.screen !== 'play' || App.paused) { Sound.saucer(0); Sound.missile(0); }
    render(App.freeze ? 0.016 : dt);
    REN.perf(dt); App.fps = App.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  }
  requestAnimationFrame(frame);

  /* ---------------- test hooks ---------------- */
  window.VA = {
    get screen() { return App.screen; }, app: App, sim: Sim, get G() { return App.G; }, get hits() { return App.hits; }, net: Net, FX, R: RR,
    hitsCss() { return App.hits.map(b => ({ label: b.label, x: (b.x + b.w / 2) / App.hd, y: (b.y + b.h / 2) / App.hd, w: b.w / App.hd, h: b.h / App.hd })); },
    touchCss() { if (!App.tc) return null; const k = 1 / App.hd, tc = App.tc; return { fires: tc.fires.map(f => ({ x: f.cx * k, y: f.cy * k, r: f.r * k })), stick: { x: tc.stickHome.cx * k, y: tc.stickHome.cy * k, r: tc.stickR * k }, tl: tc.tl && { x: (tc.tl.x + tc.tl.w / 2) * k, y: (tc.tl.y + tc.tl.h / 2) * k }, tr: tc.tr && { x: (tc.tr.x + tc.tr.w / 2) * k, y: (tc.tr.y + tc.tr.h / 2) * k }, pause: { x: (tc.pause.x + tc.pause.w / 2) * k, y: (tc.pause.y + tc.pause.h / 2) * k } }; },
    step(n) { for (let i = 0; i < (n || 1); i++) tick(); },
    adv(n) { for (let i = 0; i < (n || 1); i++) { tick(); FX.update(DT); App.shake *= 0.92; App.recoil *= 0.89; App.dmg *= 0.974; } render(DT); },
    freeze(on) { App.freeze = !!on; },
    start(level) { startSolo(level || 1); },
    go(s) { go(s); }, input: readInput, render() { render(0.016); }, toTitle, handleEvents,
  };
})();
