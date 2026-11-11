/* RELAX
   A kinetic sand table, seen from directly above. Under a round bowl of
   Martian sand a magnet travels on a programmed path (the way the desktop
   toys move a hidden magnet on an XY or geared arm). A steel ball follows
   with lag, because the pull is finite and the sand drags. The groove and
   its berms are a heightfield. A rover and an astronaut share the bowl. */
(function () {
  'use strict';

  const q = new URLSearchParams(location.search);
  const FAST = q.get('fast') === '1';
  const CYCLE = FAST ? 8 : 60;
  const RAKE = FAST ? 1.6 : 3.6;
  const seedArg = q.get('seed');
  let seed = seedArg != null ? (Number(seedArg) >>> 0) || 1 : (Date.now() >>> 0);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(seed);
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d', { alpha: false });
  const hintEl = document.getElementById('hint');
  const nowEl = document.getElementById('now');
  const patternEl = document.getElementById('pattern');
  const btnNext = document.getElementById('btn-next');
  const btnFx = document.getElementById('btn-fx');
  const btnMute = document.getElementById('btn-mute');
  const btnHint = document.getElementById('btn-hint');
  const volEl = document.getElementById('vol');

  const patterns = window.RelaxPatterns;
  const sandN = Math.min(window.innerWidth, window.innerHeight) < 760 ? 200 : 268;
  const sand = new window.RelaxSand(sandN);
  const actors = new window.RelaxActors(rand);
  const music = new window.RelaxMusic(rand);

  let bag = [];
  let bagAt = 0;
  let lastId = -1;
  function takePattern() {
    if (bagAt >= bag.length) {
      bag = shuffle(patterns.map(function (_, i) { return i; }));
      if (bag.length > 1 && bag[0] === lastId) {
        const t = bag[0]; bag[0] = bag[1]; bag[1] = t;
      }
      bagAt = 0;
    }
    const id = bag[bagAt++];
    lastId = id;
    return id;
  }

  let patternId = takePattern();
  let nextId = patternId;
  let phase = 'draw';
  let cycleT = 0;
  let patternTime = 0;
  let rakeT = 0;
  let changes = 0;
  const magnet = { x: 0, y: 0 };
  const magnetFrom = { x: 0, y: 0 };
  (function placeBall() {
    const p = patterns[patternId].pos(0);
    magnet.x = p.x; magnet.y = p.y;
    actors.ball.x = p.x; actors.ball.y = p.y;
  })();

  let effects = true;
  let pointer = null;
  let stick = { x: 0, y: 0 };
  const held = new Set();
  let audioLevel = 0;
  let time = 0;
  let sparkles = [];
  let stars = [];
  let motes = [];
  let view = { w: 1, h: 1, dpr: 1, cx: 0, cy: 0, R: 1 };

  function prefs() {
    try {
      return {
        muted: localStorage.getItem('relax.muted') === '1',
        vol: localStorage.getItem('relax.vol'),
        fx: localStorage.getItem('relax.fx')
      };
    } catch (e) { return {}; }
  }
  const saved = prefs();
  if (saved.fx === '0') effects = false;
  if (saved.vol != null && saved.vol !== '') {
    const v = Number(saved.vol);
    if (!Number.isNaN(v)) { music.setVolume(v); volEl.value = String(v); }
  } else volEl.value = String(music.volume);
  if (saved.muted) music.setMuted(true);
  btnFx.setAttribute('aria-pressed', effects ? 'true' : 'false');
  syncMute();

  function persist() {
    try {
      localStorage.setItem('relax.muted', music.muted ? '1' : '0');
      localStorage.setItem('relax.vol', String(music.volume));
      localStorage.setItem('relax.fx', effects ? '1' : '0');
    } catch (e) { /* private mode */ }
  }
  function syncMute() {
    btnMute.textContent = music.muted ? 'Unmute' : 'Mute';
    btnMute.setAttribute('aria-pressed', music.muted ? 'true' : 'false');
    btnMute.setAttribute('aria-label', music.muted ? 'Unmute' : 'Mute');
  }

  function layout() {
    const dprCap = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth, h = window.innerHeight;
    let dpr = dprCap;
    if (w * h * dpr * dpr > 2.6e6) dpr = Math.max(1, Math.sqrt(2.6e6 / (w * h)));
    canvas.width = Math.max(2, Math.round(w * dpr));
    canvas.height = Math.max(2, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const top = 54, bot = 78;
    const side = Math.max(80, Math.min(w - 16, h - top - bot));
    view = { w: w, h: h, dpr: dpr, cx: w / 2, cy: top + (h - top - bot) / 2, R: side * 0.46 };
    buildField();
  }

  function buildField() {
    const count = view.w < 700 ? 70 : 130;
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(), y: rand(),
        r: rand() * 1.4 + 0.3,
        p: rand() * Math.PI * 2,
        s: 0.4 + rand() * 1.4
      });
    }
    motes = [];
    for (let i = 0; i < 28; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.92;
      motes.push({
        x: Math.cos(a) * r, y: Math.sin(a) * r,
        vx: (rand() - 0.5) * 0.02, vy: (rand() - 0.5) * 0.015,
        s: 0.6 + rand() * 1.6, p: rand() * 6
      });
    }
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - view.cx) / view.R, y: (sy - view.cy) / view.R };
  }

  function beginRake() {
    if (phase === 'rake') return;
    phase = 'rake';
    rakeT = 0;
    magnetFrom.x = magnet.x;
    magnetFrom.y = magnet.y;
    nextId = takePattern();
    music.next();
  }
  function finishPattern() {
    sand.finishRake();
    patternId = nextId;
    patternTime = 0;
    cycleT = 0;
    phase = 'draw';
    changes++;
    const p = patterns[patternId].pos(0);
    magnet.x = p.x;
    magnet.y = p.y;
  }
  function skip() {
    if (phase === 'rake') finishPattern();
    else beginRake();
  }
  function toggleFx() {
    effects = !effects;
    btnFx.setAttribute('aria-pressed', effects ? 'true' : 'false');
    persist();
  }

  function ensureMusic() {
    music.start();
    persist();
  }

  function onKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
    if (e.repeat) { held.add(e.code); return; }
    held.add(e.code);
    ensureMusic();
    if (e.code === 'Space') skip();
    else if (e.code === 'Enter') toggleFx();
    else if (e.code === 'KeyM') { music.toggleMuted(); syncMute(); persist(); }
    else if (e.code === 'KeyH' || e.code === 'Slash') hintEl.classList.toggle('hide');
  }
  function onKeyUp(e) { held.delete(e.code); }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', function () { held.clear(); pointer = null; });

  function localPoint(ev) {
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX != null ? ev.clientX : 0) - r.left;
    const y = (ev.clientY != null ? ev.clientY : 0) - r.top;
    return { x: x, y: y };
  }
  canvas.addEventListener('pointerdown', function (ev) {
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    const p = localPoint(ev);
    const w = screenToWorld(p.x, p.y);
    if (Math.hypot(w.x, w.y) < 1.15) pointer = w;
    ensureMusic();
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!pointer) return;
    const p = localPoint(ev);
    pointer = screenToWorld(p.x, p.y);
  });
  function endPointer() { pointer = null; }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  btnNext.addEventListener('click', function () { ensureMusic(); skip(); });
  btnFx.addEventListener('click', function () { ensureMusic(); toggleFx(); });
  btnMute.addEventListener('click', function () { ensureMusic(); music.toggleMuted(); syncMute(); persist(); });
  btnHint.addEventListener('click', function () { hintEl.classList.toggle('hide'); });
  volEl.addEventListener('input', function () {
    ensureMusic();
    music.setVolume(Number(volEl.value));
    persist();
  });

  /* Gamepad polled in the frame. Edges for A / X / Start. */
  const gpWas = { a: false, x: false, start: false };
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let best = null;
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) best = pads[i];
    stick.x = 0; stick.y = 0;
    if (!best) return;
    const ax = best.axes[0] || 0, ay = best.axes[1] || 0;
    const dead = 0.22;
    if (Math.hypot(ax, ay) > dead) { stick.x = ax; stick.y = ay; }
    const b0 = !!(best.buttons[0] && best.buttons[0].pressed);
    const b2 = !!(best.buttons[2] && best.buttons[2].pressed);
    const b9 = !!(best.buttons[9] && best.buttons[9].pressed);
    if (b0 || b2 || b9) ensureMusic();
    if (b0 && !gpWas.a) skip();
    if (b2 && !gpWas.x) toggleFx();
    if (b9 && !gpWas.start) { music.toggleMuted(); syncMute(); persist(); }
    gpWas.a = b0; gpWas.x = b2; gpWas.start = b9;
  }

  function keyNudge() {
    let x = 0, y = 0;
    if (held.has('ArrowLeft') || held.has('KeyA')) x -= 1;
    if (held.has('ArrowRight') || held.has('KeyD')) x += 1;
    if (held.has('ArrowUp') || held.has('KeyW')) y -= 1;
    if (held.has('ArrowDown') || held.has('KeyS')) y += 1;
    if (stick.x || stick.y) { x += stick.x; y += stick.y; }
    return { x: x, y: y };
  }

  function spawnSpark(wx, wy) {
    sparkles.push({
      x: wx, y: wy,
      life: 0.55 + rand() * 0.35,
      max: 0.9,
      hue: rand()
    });
    if (sparkles.length > 36) sparkles.splice(0, sparkles.length - 36);
  }

  function update(dt) {
    time += dt;
    pollPad();
    music.tick();
    const raw = music.level();
    audioLevel += (raw - audioLevel) * Math.min(1, dt * 4);

    cycleT += dt;
    if (phase === 'draw') {
      patternTime += dt;
      const p = patterns[patternId].pos(patternTime);
      magnet.x = p.x;
      magnet.y = p.y;
      if (cycleT >= CYCLE - RAKE) beginRake();
    } else {
      rakeT += dt;
      const u = Math.min(1, rakeT / RAKE);
      const e = u * u * (3 - 2 * u);
      const start = patterns[nextId].pos(0);
      magnet.x = magnetFrom.x + (start.x - magnetFrom.x) * e;
      magnet.y = magnetFrom.y + (start.y - magnetFrom.y) * e;
      sand.rake(u);
      if (rakeT >= RAKE) finishPattern();
    }

    let user = null;
    if (pointer) {
      const d = Math.hypot(pointer.x, pointer.y);
      const k = d > 0.92 ? 0.92 / d : 1;
      user = { x: pointer.x * k, y: pointer.y * k };
    } else {
      const n = keyNudge();
      if (n.x || n.y) {
        const len = Math.hypot(n.x, n.y) || 1;
        user = { x: actors.ball.x + (n.x / len) * 0.42, y: actors.ball.y + (n.y / len) * 0.42 };
      }
    }

    const b0 = actors.ball;
    const sp = Math.hypot(b0.vx, b0.vy) || 1;
    const tx = -b0.vy / sp, ty = b0.vx / sp;
    const sideH = Math.min(
      sand.sample(b0.x + tx * 0.055, b0.y + ty * 0.055),
      sand.sample(b0.x - tx * 0.055, b0.y - ty * 0.055)
    );
    if (phase === 'draw') sand.settle(dt);
    actors.update(Math.min(dt, 0.05), sand, magnet, user, phase === 'draw');
    if (phase === 'draw' && sideH < -0.42 && rand() < 0.45) spawnSpark(actors.ball.x, actors.ball.y);

    for (let i = sparkles.length - 1; i >= 0; i--) {
      sparkles[i].life -= dt;
      if (sparkles[i].life <= 0) sparkles.splice(i, 1);
    }
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (Math.hypot(m.x, m.y) > 0.95) { m.vx *= -1; m.vy *= -1; }
    }
  }

  const palettes = [
    [[8, 12, 24], [16, 46, 72], [10, 24, 42]],
    [[12, 10, 28], [42, 28, 72], [18, 36, 64]],
    [[8, 18, 26], [18, 58, 62], [22, 36, 48]]
  ];
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgb(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }

  function draw() {
    const dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = view.w, h = view.h;
    const pulse = effects ? (0.5 + 0.5 * Math.sin(time * 0.07)) : 0;
    const pIndex = effects ? (time * 0.03) % palettes.length : 0;
    const i0 = Math.floor(pIndex) % palettes.length;
    const i1 = (i0 + 1) % palettes.length;
    const pt = pIndex - Math.floor(pIndex);
    const c0 = mix(palettes[i0][0], palettes[i1][0], effects ? pt : 0);
    const c1 = mix(palettes[i0][1], palettes[i1][1], effects ? pt : 0);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, rgb(c0, 1));
    bg.addColorStop(1, rgb(mix(c0, [0, 0, 0], 0.45), 1));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const neb = ctx.createRadialGradient(w * (0.3 + pulse * 0.15), h * 0.35, 20, w * 0.5, h * 0.45, Math.max(w, h) * 0.7);
    neb.addColorStop(0, rgb(c1, 0.55 + audioLevel * 0.25));
    neb.addColorStop(1, rgb(c1, 0));
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.s + s.p));
      const boost = effects ? audioLevel * 0.8 : 0;
      ctx.globalAlpha = Math.min(1, tw + boost);
      ctx.fillStyle = '#f4f7ff';
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r * (1 + boost), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const cx = view.cx, cy = view.cy, R = view.R;
    ctx.save();
    ctx.translate(cx, cy);
    /* wooden rim */
    const wood = ctx.createRadialGradient(0, 0, R * 0.98, 0, 0, R * 1.11);
    wood.addColorStop(0, '#1a100c');
    wood.addColorStop(0.25, '#8a5a3a');
    wood.addColorStop(0.45, '#3a2418');
    wood.addColorStop(0.7, '#6b4630');
    wood.addColorStop(1, '#140e0b');
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.11, 0, Math.PI * 2);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.08, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(40, 22, 12, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, R * (1.0 + i * 0.006), R * (1.02 + i * 0.004), i * 0.2, 0, Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.005, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 220, 180, 0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.985, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = R * 0.03;
    ctx.stroke();

    sand.shade(time * 0.22, effects, audioLevel);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.978, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(sand.canvas, -R, -R, R * 2, R * 2);
    if (effects) {
      ctx.save();
      ctx.rotate(time * 0.12);
      const sweep = ctx.createLinearGradient(-R, 0, R, 0);
      sweep.addColorStop(0, 'rgba(255,255,255,0)');
      sweep.addColorStop(0.45, 'rgba(255, 236, 210, 0)');
      sweep.addColorStop(0.5, 'rgba(255, 244, 230, ' + (0.07 + audioLevel * 0.05) + ')');
      sweep.addColorStop(0.55, 'rgba(255, 236, 210, 0)');
      sweep.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sweep;
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.restore();
    }
    if (phase === 'rake') {
      const u = Math.min(1, rakeT / RAKE);
      const x = -R + u * R * 2;
      const band = ctx.createLinearGradient(x - R * 0.12, 0, x + R * 0.08, 0);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.6, 'rgba(255, 228, 190, 0.28)');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = band;
      ctx.fillRect(-R, -R, R * 2, R * 2);
    }
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const a = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(time * 0.8 + m.p));
      ctx.fillStyle = 'rgba(255, 214, 170, ' + a + ')';
      ctx.beginPath();
      ctx.arc(m.x * R, m.y * R, m.s, 0, 7);
      ctx.fill();
    }
    for (let i = 0; i < sparkles.length; i++) {
      const s = sparkles[i];
      const a = Math.max(0, s.life / s.max);
      ctx.save();
      ctx.translate(s.x * R, s.y * R);
      ctx.rotate(s.hue * 3);
      ctx.globalAlpha = a;
      ctx.strokeStyle = s.hue > 0.5 ? 'rgba(180, 255, 240, 0.9)' : 'rgba(255, 236, 190, 0.95)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const L = 3 + (1 - a) * 4;
      ctx.moveTo(-L, 0); ctx.lineTo(L, 0);
      ctx.moveTo(0, -L); ctx.lineTo(0, L);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    actors.draw(ctx, 0, 0, R, time);

    const b = actors.ball;
    const bx = b.x * R, by = b.y * R;
    const br = Math.max(3.5, b.r * R);
    const glowR = br * (5.5 + (effects ? 3.5 + audioLevel * 4 : 1.2));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(bx, by, br * 0.2, bx, by, glowR);
    const ga = effects ? 0.55 + audioLevel * 0.4 : 0.22;
    glow.addColorStop(0, 'rgba(255, 228, 190, ' + ga + ')');
    glow.addColorStop(0.35, 'rgba(90, 220, 200, ' + (ga * 0.45) + ')');
    glow.addColorStop(0.7, 'rgba(120, 90, 220, ' + (effects ? ga * 0.18 : 0) + ')');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bx, by, glowR, 0, 7);
    ctx.fill();
    ctx.restore();
    const steel = ctx.createRadialGradient(bx - br * 0.38, by - br * 0.42, br * 0.1, bx, by, br);
    steel.addColorStop(0, '#ffffff');
    steel.addColorStop(0.22, '#e4e7ee');
    steel.addColorStop(0.62, '#7d8796');
    steel.addColorStop(1, '#2c3340');
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx - br * 0.25, by - br * 0.28, br * 0.28, 0.4, 2.4);
    ctx.stroke();

    if (pointer && effects) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(140, 230, 220, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.arc(pointer.x * R, pointer.y * R, br * 2.2, 0, 7);
      ctx.stroke();
    }
    ctx.restore();

    const vig = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, Math.max(w, h) * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  function hud() {
    const pat = patterns[patternId];
    const label = phase === 'rake' ? 'Raking the sand' : pat.name;
    patternEl.textContent = label;
    const line = music.line();
    nowEl.textContent = '';
    if (music.track && music.unlocked) {
      const a = document.createElement('a');
      a.href = music.track.page;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = line;
      nowEl.appendChild(a);
    } else {
      nowEl.textContent = line;
    }
  }

  let last = performance.now();
  let hintUntil = last + 9000;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > 0.25) dt = 0.25;
    update(dt);
    draw();
    hud();
    if (now > hintUntil) hintEl.classList.add('hide');
    requestAnimationFrame(frame);
  }

  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  if (window.MoodSticker && MoodSticker.screen) MoodSticker.screen('play');

  const api = {
    fast: FAST,
    cycle: CYCLE,
    rake: RAKE,
    seed: seed,
    patterns: patterns.map(function (p) { return p.name; }),
    trackCount: music.tracks.length,
    allTrackCount: music.all.length,
    stats: actors.stats,
    get phase() { return phase; },
    get changes() { return changes; },
    get cycleT() { return cycleT; },
    get pattern() { return patterns[patternId].name; },
    get patternId() { return patterns[patternId].id; },
    get groove() { return sand.groove(); },
    get rover() { return { x: actors.rover.x, y: actors.rover.y, pose: actors.rover.pose }; },
    get astro() { return { x: actors.astro.x, y: actors.astro.y, pose: actors.astro.pose }; },
    get ball() { return { x: actors.ball.x, y: actors.ball.y }; },
    get effects() { return effects; },
    audioElement: function () { return music.element(); },
    analyserSum: function () { return music.sum(); },
    musicLine: function () { return music.line(); },
    unlocked: function () { return music.unlocked; },
    skip: skip
  };
  window.RELAX = api;
  requestAnimationFrame(frame);
})();
