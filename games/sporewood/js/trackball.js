/* SPOREWOOD — trackball.js
   The shooter rides a light, fast virtual trackball (same model as Trackball Football, retuned for a shooter).
   Every input is turned into a "hand velocity". The hand drags the ball's surface toward its own speed (fast
   spin-up, very fast braking when you stroke against it, slipping when your hand is slower). Let go and the
   ball coasts on bearing friction that is strong at low speed (a slow, careful nudge stops dead where you
   leave it) and light at high speed (a hard flick glides on across the zone). The ball's surface velocity IS
   the shooter's velocity, so the faster you stroke, the faster you move.
   Sources: Pointer Lock mouse / trackpad (movementX/Y), two-finger trackpad scroll (wheel deltaX/Y), touch
   drags & flicks, arrows/WASD (with acceleration), gamepad stick / d-pad.
   ========================================================================================================== */
const Track = (() => {
  'use strict';
  const REF = { mouse: 1000, wheel: 1100, touch: 520 };        // px/s of hand speed = full speed 1.0 (touch is re-set from the layout)
  const K_UP = 15, K_BRAKE = 34, K_SLIP = 4, K_REST = 26;        // hand-ball coupling (1/s)
  const FRICTION = 2.1, LOWBRAKE = 13, LOWV = 0.33, DRAG = 0.12, WMAX = 1.7;
  const TOP = 230;                                               // field units per second at |w| = 1 (field is 240 wide)
  const w = { x: 0, y: 0 };
  const src = {
    mouse: { dx: 0, dy: 0, hs: { x: 0, y: 0 }, last: -1e9 },
    wheel: { dx: 0, dy: 0, hs: { x: 0, y: 0 }, last: -1e9 },
    touch: { dx: 0, dy: 0, hs: { x: 0, y: 0 }, last: -1e9, down: false },
  };
  const st = { hand: { x: 0, y: 0 }, active: false, kind: '', locked: false, lockFailed: false, kramp: 0, pad: { x: 0, y: 0 }, keys: null,
    invertWheel: localStorage.getItem('spw.invwheel') === '1', lastKind: '', frozen: false, spin: 0 };
  let canvas = null;
  const now = () => performance.now();
  function feed(kind, dx, dy) { const s = src[kind]; if (!s) return; s.dx += dx; s.dy += dy; s.last = now(); st.lastKind = kind; }
  function init(cv, keys) {
    canvas = cv; st.keys = keys;
    document.addEventListener('pointerlockchange', () => { st.locked = document.pointerLockElement === canvas; });
    document.addEventListener('pointerlockerror', () => { st.locked = false; st.lockFailed = true; });
    addEventListener('mousemove', e => { if (st.locked || window.__testMouse) feed('mouse', e.movementX || 0, e.movementY || 0); });
    addEventListener('wheel', e => {
      e.preventDefault();
      const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1, sg = st.invertWheel ? 1 : -1;  // natural scrolling: fingers up -> deltaY > 0
      let dx = e.deltaX * m * sg, dy = e.deltaY * m * sg; if (e.shiftKey && !e.deltaX) { dx = dy; dy = 0; }
      feed('wheel', dx, dy);
    }, { passive: false });
  }
  function requestLock() {
    if (!canvas || st.locked || !canvas.requestPointerLock) return;
    try { const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch (_) { } }); }
    catch (_) { try { canvas.requestPointerLock(); } catch (__) { } }
  }
  function releaseLock() { if (st.locked && document.exitPointerLock) document.exitPointerLock(); }
  function touchDown() { src.touch.down = true; src.touch.last = now(); st.lastKind = 'touch'; }
  function touchUp() { src.touch.down = false; }
  function sourceHand(kind, dt, t) {
    const s = src[kind], ref = REF[kind];
    const ix = s.dx / dt / ref, iy = s.dy / dt / ref; s.dx = s.dy = 0;
    const moving = t - s.last < 70, k = 1 - Math.exp(-dt * 30);
    if (moving || s.down) { s.hs.x += (ix - s.hs.x) * k; s.hs.y += (iy - s.hs.y) * k; } else s.hs.x = s.hs.y = 0;
    return moving || s.down;
  }
  /** integrate one frame. pad = {x,y} stick (already dead-zoned). */
  function update(dt, pad) {
    dt = Math.max(1 / 240, Math.min(0.05, dt)); const t = now();
    let hx = 0, hy = 0, active = false, rest = false;
    for (const kind of ['mouse', 'wheel', 'touch']) if (sourceHand(kind, dt, t)) { const s = src[kind]; hx += s.hs.x; hy += s.hs.y; active = true; st.kind = kind; if (kind === 'touch') rest = true; }
    const K = st.keys || {};
    const kx = (K.ArrowRight || K.KeyD ? 1 : 0) - (K.ArrowLeft || K.KeyA ? 1 : 0), ky = (K.ArrowDown || K.KeyS ? 1 : 0) - (K.ArrowUp || K.KeyW ? 1 : 0);
    if (kx || ky) { st.kramp = Math.min(1.05, (st.kramp || 0.3) + dt * 1.6); const m = Math.hypot(kx, ky); hx += kx / m * st.kramp; hy += ky / m * st.kramp; active = true; st.kind = 'keys'; rest = true; }
    else st.kramp = 0;
    if (pad && (pad.x || pad.y)) { hx += pad.x * 1.05; hy += pad.y * 1.05; active = true; st.kind = 'pad'; rest = true; }
    st.hand.x = hx; st.hand.y = hy; st.active = active;
    if (st.frozen) { w.x = w.y = 0; return; }
    if (active) {
      const hm = Math.hypot(hx, hy), wm = Math.hypot(w.x, w.y), dot = hx * w.x + hy * w.y;
      let k;
      if (wm > 0.02 && dot < -0.05 * hm * wm) k = K_BRAKE;
      else if (hm > wm) k = K_UP;
      else k = rest && hm < 0.06 ? K_REST : (rest ? 9 : K_SLIP);   // keys/pad/touch hold the ball; a free-spinning ball under a slow mouse slips
      const a = 1 - Math.exp(-k * dt); w.x += (hx - w.x) * a; w.y += (hy - w.y) * a;
    }
    let wm = Math.hypot(w.x, w.y);
    if (!active || Math.hypot(hx, hy) < 0.02) {
      const fr = FRICTION + (wm < LOWV ? LOWBRAKE * (1 - wm / LOWV) : 0), f = Math.exp(-fr * dt); w.x *= f; w.y *= f;
      wm = Math.hypot(w.x, w.y); if (wm > 0) { const n = Math.max(0, wm - DRAG * dt); w.x *= n / wm; w.y *= n / wm; wm = n; }
    }
    // keys and the stick are not a ball: once released they settle quickly instead of coasting like a flick
    if (!active && (st.kind === 'keys' || st.kind === 'pad') && wm > 0) { const f = Math.exp(-12 * dt); w.x *= f; w.y *= f; wm *= f; }
    if (wm > WMAX) { w.x *= WMAX / wm; w.y *= WMAX / wm; wm = WMAX; }
    if (wm < 0.006) { w.x = w.y = 0; wm = 0; }
    st.spin += wm * dt * 9;
  }
  /** shooter velocity in field units / second */
  function vel() { return { x: w.x * TOP, y: w.y * TOP }; }
  /** the sim reports the shooter was blocked on an axis: kill that component (the ball stops against a mushroom) */
  function block(bx, by) { if (bx) w.x *= 0.15; if (by) w.y *= 0.15; }
  function stop() { w.x = w.y = 0; for (const k in src) { src[k].dx = src[k].dy = 0; src[k].hs.x = src[k].hs.y = 0; } }
  function setInvertWheel(v) { st.invertWheel = v; localStorage.setItem('spw.invwheel', v ? '1' : '0'); }
  return { st, w, src, REF, TOP, init, feed, update, vel, block, stop, requestLock, releaseLock, touchDown, touchUp, setInvertWheel };
})();
