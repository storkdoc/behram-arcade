// Jax's Adventures - input: keyboard, mouse orbit, gamepad, touch (twin-zone + HUD buttons)
export class Input {
  constructor(canvas, hud) {
    this.c = canvas; this.hud = hud; this.keys = new Set(); this.edges = new Set(); this.ups = new Set();
    this.orbit = { dx: 0, dy: 0, zoom: 1 }; this.drag = null; this.touch = { stick: null, cam: null, btn: new Map() }; this.mobile = false; this.lastPad = {};
    this.touchSneak = false; this.padUsed = false; this.sens = 1;
    const kd = e => { if (e.repeat && this.keys.has(e.code)) { if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code); this.edges.add(e.code); if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); this.onAny && this.onAny(); };
    const ku = e => { this.keys.delete(e.code); this.ups.add(e.code); };
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', () => { this.keys.clear(); });
    // mouse
    canvas.addEventListener('mousedown', e => { this.onAny && this.onAny(); if (this.hud.click(e.clientX, e.clientY, 'down')) { this.hudDown = true; return; } this.drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('mousemove', e => { this.hud.hover(e.clientX, e.clientY); if (!this.drag) return; this.orbit.dx -= (e.clientX - this.drag.x) * 0.006 * this.sens; this.orbit.dy += (e.clientY - this.drag.y) * 0.005 * this.sens; this.drag.x = e.clientX; this.drag.y = e.clientY; });
    addEventListener('mouseup', e => { if (this.hudDown) { this.hud.click(e.clientX, e.clientY, 'up'); this.hudDown = false; } this.drag = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); if (this.hud.wheel(e.clientX, e.clientY, e.deltaY)) return; this.orbit.zoom *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // touch
    const ts = e => { e.preventDefault(); this.mobile = true; this.onAny && this.onAny();
      for (const t of e.changedTouches) { const x = t.clientX, y = t.clientY; const b = this.hud.touchButton(x, y);
        if (b) { this.touch.btn.set(t.identifier, b); this.edges.add('T_' + b); this.keys.add('T_' + b); continue; }
        if (this.hud.click(x, y, 'down')) { this.touch.btn.set(t.identifier, '__ui'); continue; }
        if (x < innerWidth * 0.45 && !this.touch.stick && this.hud.stickAllowed()) { this.touch.stick = { id: t.identifier, ox: x, oy: y, x, y }; }
        else if (!this.touch.cam) this.touch.cam = { id: t.identifier, x, y, sx: x, sy: y, t: performance.now() }; } };
    const tm = e => { e.preventDefault(); for (const t of e.changedTouches) { const s = this.touch.stick, c = this.touch.cam;
        if (s && s.id === t.identifier) { s.x = t.clientX; s.y = t.clientY; const R = this.stickR(); const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy); if (d > R * 1.25) { s.ox = s.x - dx / d * R * 1.25; s.oy = s.y - dy / d * R * 1.25; } }
        else if (c && c.id === t.identifier) { this.orbit.dx -= (t.clientX - c.x) * 0.008 * this.sens; this.orbit.dy += (t.clientY - c.y) * 0.006 * this.sens; c.x = t.clientX; c.y = t.clientY; }
        else if (this.touch.btn.get(t.identifier) === '__ui') this.hud.drag && this.hud.drag(t.clientX, t.clientY); } };
    const te = e => { e.preventDefault(); for (const t of e.changedTouches) { const b = this.touch.btn.get(t.identifier); if (b) { this.touch.btn.delete(t.identifier); if (b === '__ui') this.hud.click(t.clientX, t.clientY, 'up'); else { this.keys.delete('T_' + b); this.ups.add('T_' + b); } continue; }
        if (this.touch.stick && this.touch.stick.id === t.identifier) this.touch.stick = null; if (this.touch.cam && this.touch.cam.id === t.identifier) this.touch.cam = null; } };
    canvas.addEventListener('touchstart', ts, { passive: false }); canvas.addEventListener('touchmove', tm, { passive: false }); canvas.addEventListener('touchend', te, { passive: false }); canvas.addEventListener('touchcancel', te, { passive: false });
    // pinch zoom (2 fingers on camera side handled as drag; use gesture events on iOS Safari)
    addEventListener('gesturestart', e => e.preventDefault());
  }
  stickR() { return Math.min(70, Math.max(46, Math.min(innerWidth, innerHeight) * 0.11)); }
  stickVec() { const s = this.touch.stick; if (!s) return null; const R = this.stickR(); let x = (s.x - s.ox) / R, y = (s.y - s.oy) / R; const d = Math.hypot(x, y); if (d < 0.12) return { x: 0, y: 0, m: 0 }; if (d > 1) { x /= d; y /= d; } return { x, y, m: Math.min(1, d) }; }
  down(...c) { return c.some(k => this.keys.has(k)); }
  hit(...c) { return c.some(k => this.edges.has(k)); }
  rel(...c) { return c.some(k => this.ups.has(k)); }
  pad() { const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null; if (!gp) return null; const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed); const o = { ax: gp.axes[0] || 0, ay: gp.axes[1] || 0, rx: gp.axes[2] || 0, ry: gp.axes[3] || 0, A: b(0), B: b(1), X: b(2), Y: b(3), LB: b(4), RB: b(5), LT: b(6), RT: b(7), back: b(8), start: b(9), L3: b(10), up: b(12), down: b(13), left: b(14), right: b(15) };
    const e = {}; for (const k in o) if (typeof o[k] === 'boolean') { e[k] = o[k] && !this.lastPad[k]; e[k + 'Up'] = !o[k] && this.lastPad[k]; } this.lastPad = o; if (Object.values(o).some(v => v === true) || Math.abs(o.ax) + Math.abs(o.ay) > 0.3) this.padUsed = true; return { ...o, e }; }
  // build sim input (camera-relative movement) + UI edges; call once per frame
  frame(camYaw) {
    const p = this.pad(); const k = (...c) => this.down(...c); let fx = 0, sx = 0;
    if (k('KeyW', 'ArrowUp')) fx += 1; if (k('KeyS', 'ArrowDown')) fx -= 1; if (k('KeyD', 'ArrowRight')) sx += 1; if (k('KeyA', 'ArrowLeft')) sx -= 1;
    let mag = Math.hypot(fx, sx); if (mag > 1) { fx /= mag; sx /= mag; }
    const sv = this.stickVec(); let touchRun = false; if (sv && sv.m > 0) { fx = -sv.y; sx = sv.x; touchRun = sv.m > 0.92; }
    if (p && Math.hypot(p.ax, p.ay) > 0.18) { fx = -p.ay; sx = p.ax; }
    if (p) { if (Math.abs(p.rx) > 0.15) this.orbit.dx -= p.rx * 0.045; if (Math.abs(p.ry) > 0.15) this.orbit.dy += p.ry * 0.03; }
    const c = Math.cos(camYaw), s = Math.sin(camYaw); const mx = fx * c - sx * s, mz = fx * s + sx * c;
    const E = p ? p.e : {}; const h = (...c) => this.hit(...c), r = (...c) => this.rel(...c);
    const inp = {
      mx, mz, run: k('ShiftLeft', 'ShiftRight') || touchRun || !!(p && (p.RT || p.L3 || p.RB)),
      crouchHeld: k('KeyC', 'ControlLeft', 'ControlRight') || !!(p && p.B && false), crouchToggle: h('T_sneak') || !!E.B,
      action: h('Space', 'T_act') || !!E.A, actionHeld: k('Space', 'T_act') || !!(p && p.A), actionUp: r('Space', 'T_act') || !!E.AUp,
      interact: h('KeyE', 'Enter'), jump: h('T_jump'),
      fishDown: h('KeyF', 'T_fish') || !!E.X, fishHeld: k('KeyF', 'T_fish') || !!(p && p.X), fishUp: r('KeyF', 'T_fish') || !!E.XUp,
      bike: h('KeyR', 'T_bike') || !!E.LB, cancel: h('Escape') || !!E.back,
    };
    const ui = { inv: h('KeyI', 'Tab', 'T_inv') || !!E.Y, map: h('KeyM', 'T_map') || !!E.up, quests: h('KeyQ', 'T_quests') || !!E.right, pause: h('KeyP', 'Escape', 'T_pause') || !!E.start, journal: h('KeyJ') || !!E.left,
      nav: { up: h('ArrowUp', 'KeyW') || !!E.up, down: h('ArrowDown', 'KeyS') || !!E.down, left: h('ArrowLeft', 'KeyA') || !!E.left, right: h('ArrowRight', 'KeyD') || !!E.right, ok: h('Enter', 'Space', 'KeyE') || !!E.A, back: h('Escape', 'Backspace') || !!E.B, tabL: h('BracketLeft', 'Comma') || !!E.LB, tabR: h('BracketRight', 'Period') || !!E.RB }, mute: h('KeyN'), digits: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => h('Digit' + d)) };
    const orb = { ...this.orbit }; this.orbit.dx = 0; this.orbit.dy = 0; this.orbit.zoom = 1;
    this.edges.clear(); this.ups.clear();
    return { inp, ui, orb, pad: !!p };
  }
}
