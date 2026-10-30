/* ==========================================================================
   TRACKBALL FOOTBALL — trackball.js
   A heavy virtual trackball. Every input source is turned into a "hand
   velocity" (how fast your hand is moving across the ball's surface). The
   hand drags the ball's surface toward its own speed: quickly when it is
   faster than the ball (spin-up), very quickly when it moves against it
   (braking), barely when it is slower (your palm slipping). Let go and the
   ball coasts down on bearing friction. The ball's surface speed is what the
   game uses as your player's speed and direction, so the faster you stroke,
   the faster you run, and repeated strokes keep you at full tilt.
   Sources: Pointer Lock mouse / trackpad (movementX/Y), two-finger trackpad
   scroll (wheel deltaX/Y), touch swipes and flicks, keyboard, gamepad.
   ========================================================================== */
const Track = (() => {
  const REF = { mouse: 1250, wheel: 1300, touch: 950 };     // px/s of hand speed that = full speed (1.0)
  const K_UP = 9, K_BRAKE = 22, K_SLIP = 2.2, K_REST = 7;   // hand-ball coupling rates (1/s)
  const FRICTION = 0.85, DRAG = 0.05, WMAX = 1.35, SPINVIS = 10;
  const w = { x: 0, y: 0 };                                  // ball surface velocity, normalized
  const R = [1, 0, 0, 0, 1, 0, 0, 0, 1];                     // ball orientation (for drawing)
  const src = {
    mouse: { dx: 0, dy: 0, hs: { x: 0, y: 0 }, last: -1e9 },
    wheel: { dx: 0, dy: 0, hs: { x: 0, y: 0 }, last: -1e9 },
    touch: { dx: 0, dy: 0, hs: { x: 0, y: 0 }, last: -1e9, down: false },
  };
  const st = {
    hand: { x: 0, y: 0 }, active: false, kind: '', locked: false, invertWheel: localStorage.getItem('tbf.invwheel') === '1',
    action: 0, alt: 0, nav: { x: 0, y: 0 }, keys: new Set(), typed: [], kramp: 0, pad: null, padA: false, padB: false, padStart: false,
    lastKind: '', lastInputAt: 0, frozen: false,
  };
  let canvas = null, tNow = 0;
  const now = () => performance.now();

  /* ---------- raw feeds (also used by the tests) ---------- */
  function feed(kind, dx, dy) {
    const s = src[kind]; if (!s) return;
    s.dx += dx; s.dy += dy; s.last = now(); st.lastKind = kind; st.lastInputAt = s.last;
  }
  function press() { st.action++; }
  function pressAlt() { st.alt++; }

  function init(cv) {
    canvas = cv;
    document.addEventListener('pointerlockchange', () => { st.locked = document.pointerLockElement === canvas; });
    document.addEventListener('pointerlockerror', () => { st.locked = false; st.lockFailed = true; });
    window.addEventListener('mousemove', e => {
      if (st.locked || App.testMouse) feed('mouse', e.movementX || 0, e.movementY || 0);
    });
    canvas.addEventListener('mousedown', e => {
      if (st.locked) { e.preventDefault(); if (e.button === 2) pressAlt(); else press(); }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('wheel', e => {
      e.preventDefault();
      const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      // natural scrolling (Mac default): fingers up -> deltaY > 0, so the hand moved by -delta
      const sg = st.invertWheel ? 1 : -1;
      let dx = e.deltaX * m * sg, dy = e.deltaY * m * sg;
      if (e.shiftKey && !e.deltaX) { dx = dy; dy = 0; }
      feed('wheel', dx, dy);
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        st.typed.push({ code: e.code, key: e.key });
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') press();
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyX') pressAlt();
      }
      st.keys.add(e.code); st.lastKind = 'keys'; st.lastInputAt = now();
    });
    window.addEventListener('keyup', e => st.keys.delete(e.code));
    window.addEventListener('blur', () => st.keys.clear());
  }
  function requestLock() {
    if (!canvas || st.locked || !canvas.requestPointerLock) return;
    try { const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch (_) { } }); } catch (_) { try { canvas.requestPointerLock(); } catch (__) { } }
  }
  function releaseLock() { if (st.locked && document.exitPointerLock) document.exitPointerLock(); }

  /* ---------- touch trackball (called by the touch layer) ---------- */
  function touchDown() { src.touch.down = true; src.touch.last = now(); st.lastKind = 'touch'; }
  function touchUp() { src.touch.down = false; }

  /* ---------- per-frame integration ---------- */
  function sourceHand(kind, dt, t) {
    const s = src[kind], ref = REF[kind];
    const ix = s.dx / dt / ref, iy = s.dy / dt / ref; s.dx = s.dy = 0;
    const moving = t - s.last < 70;
    const k = 1 - Math.exp(-dt * 28);
    if (moving || s.down) { s.hs.x += (ix - s.hs.x) * k; s.hs.y += (iy - s.hs.y) * k; }
    else { s.hs.x = s.hs.y = 0; }
    return moving || s.down;
  }
  function update(dt) {
    dt = Math.max(1 / 240, Math.min(0.05, dt)); const t = now(); tNow = t;
    let hx = 0, hy = 0, active = false, rest = false;
    for (const kind of ['mouse', 'wheel', 'touch']) {
      if (sourceHand(kind, dt, t)) { const s = src[kind]; hx += s.hs.x; hy += s.hs.y; active = true; if (kind === 'touch') rest = true; st.kind = kind; }
    }
    // keyboard: holding a direction is a hand that keeps stroking, a little faster the longer you hold
    const K = st.keys;
    const kx = (K.has('ArrowRight') || K.has('KeyD') ? 1 : 0) - (K.has('ArrowLeft') || K.has('KeyA') ? 1 : 0);
    const ky = (K.has('ArrowDown') || K.has('KeyS') ? 1 : 0) - (K.has('ArrowUp') || K.has('KeyW') ? 1 : 0);
    if (kx || ky) {
      st.kramp = Math.min(1.0, (st.kramp || 0.45) + dt * 0.75);
      const m = Math.hypot(kx, ky); hx += kx / m * st.kramp; hy += ky / m * st.kramp; active = true; st.kind = 'keys';
    } else st.kramp = 0;
    // gamepad left stick
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null; for (const p of pads || []) if (p && p.connected) { gp = p; break; }
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, m = Math.hypot(ax, ay);
      if (m > 0.2) { const s = Math.min(1, (m - 0.2) / 0.75) * 1.05; hx += ax / m * s; hy += ay / m * s; active = true; st.kind = 'pad'; st.lastKind = 'pad'; }
      const A = !!(gp.buttons[0] && gp.buttons[0].pressed), B = !!((gp.buttons[1] && gp.buttons[1].pressed) || (gp.buttons[2] && gp.buttons[2].pressed));
      const S = !!(gp.buttons[9] && gp.buttons[9].pressed);
      if (A && !st.padA) press(); if (B && !st.padB) pressAlt(); if (S && !st.padStart) st.typed.push({ code: 'KeyP', key: 'p' });
      const SH = !!((gp.buttons[4] && gp.buttons[4].pressed) || (gp.buttons[5] && gp.buttons[5].pressed)); // LB / RB: FLIP the play
      if (SH && !st.padSh) st.typed.push({ code: 'KeyF', key: 'f', pad: true }); st.padSh = SH;
      const Y = !!(gp.buttons[3] && gp.buttons[3].pressed); // Y / Triangle: HELMET CAM on / off
      if (Y && !st.padY) st.typed.push({ code: 'KeyV', key: 'v', pad: true }); st.padY = Y;
      const ux = gp.axes[0] || 0, uy = gp.axes[1] || 0; // menu nav from the stick / d-pad
      st.padNav = [ux, uy, gp.buttons[12] && gp.buttons[12].pressed, gp.buttons[13] && gp.buttons[13].pressed, gp.buttons[14] && gp.buttons[14].pressed, gp.buttons[15] && gp.buttons[15].pressed];
      st.padA = A; st.padB = B; st.padStart = S;
    }
    st.hand.x = hx; st.hand.y = hy; st.active = active;
    if (st.frozen) { w.x = w.y = 0; return; }
    // hand <-> ball coupling
    if (active) {
      const hm = Math.hypot(hx, hy), wm = Math.hypot(w.x, w.y), dot = hx * w.x + hy * w.y;
      let k;
      if (wm > 0.02 && dot < -0.05 * hm * wm) k = K_BRAKE;           // stroking against the spin: brake
      else if (hm > wm) k = K_UP;                                      // faster than the ball: spin it up
      else k = rest && hm < 0.08 ? K_REST : K_SLIP;                   // slower: palm slips (a resting finger brakes)
      const a = 1 - Math.exp(-k * dt);
      w.x += (hx - w.x) * a; w.y += (hy - w.y) * a;
    }
    // bearing friction: exponential + a little constant drag so it really stops
    const f = Math.exp(-FRICTION * dt); w.x *= f; w.y *= f;
    let wm = Math.hypot(w.x, w.y);
    if (wm > 0) { const n = Math.max(0, wm - DRAG * dt); w.x *= n / wm; w.y *= n / wm; wm = n; }
    if (wm > WMAX) { w.x *= WMAX / wm; w.y *= WMAX / wm; wm = WMAX; }
    if (wm < 0.004) { w.x = w.y = 0; wm = 0; }
    st.nav.x += w.x * dt; st.nav.y += w.y * dt;
    // spin the drawn ball: surface velocity (wx, wy) at the top point -> axis (-wy, wx, 0)
    if (wm > 0) rotate(-w.y / wm, w.x / wm, wm * SPINVIS * dt);
  }
  function rotate(ax, ay, ang) { // R = Rot(axis, ang) * R  (axis in screen plane, z toward viewer)
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, x = ax, y = ay, z = 0;
    const M = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    const o = R.slice();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = M[i * 3] * o[j] + M[i * 3 + 1] * o[3 + j] + M[i * 3 + 2] * o[6 + j];
    // re-orthonormalize occasionally
    if (Math.random() < 0.02) { const n0 = Math.hypot(R[0], R[3], R[6]); R[0] /= n0; R[3] /= n0; R[6] /= n0; }
  }
  /** what the game reads: commanded run vector, |v| in 0..~1.15 (1 = player's top speed) */
  function command() {
    const m = Math.hypot(w.x, w.y); if (m < 0.03) return { x: 0, y: 0, m: 0 };
    const s = Math.min(1.15, Math.pow(m, 0.9));
    return { x: w.x / m * s, y: w.y / m * s, m: s };
  }
  function takeTyped() { const t = st.typed; st.typed = []; return t; }
  function takeNav(th) { // menu stepping from spinning the ball
    let dx = 0, dy = 0;
    while (st.nav.x > th) { st.nav.x -= th; dx++; } while (st.nav.x < -th) { st.nav.x += th; dx--; }
    while (st.nav.y > th) { st.nav.y -= th; dy++; } while (st.nav.y < -th) { st.nav.y += th; dy--; }
    return { dx, dy };
  }
  function clearNav() { st.nav.x = st.nav.y = 0; }
  function stop() { w.x = w.y = 0; }
  function setInvertWheel(v) { st.invertWheel = v; localStorage.setItem('tbf.invwheel', v ? '1' : '0'); }
  return { st, w, R, src, init, feed, press, pressAlt, update, command, requestLock, releaseLock, touchDown, touchUp, takeTyped, takeNav, clearNav, stop, setInvertWheel, REF };
})();
