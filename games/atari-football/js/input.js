/* ==========================================================================
   ATARI FOOTBALL — input.js
   Joystick-style controls. A "Controller" reads one key set (and optionally a
   gamepad) and exposes x/y in {-1,0,1} plus two buttons:
     a = ACTION (pass / pitch / dive-tackle / juke / kick)
     b = CYCLE  (switch player / pick receiver)
   with edge detection (aP / bP = pressed this frame).
   ========================================================================== */
const Input = (() => {
  const keys = {};
  const tapped = {}; // keys pressed since the last frame (so a very quick tap is never missed)
  const typed = []; // raw key events for text entry (room code)
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Enter', 'ShiftLeft', 'ShiftRight', 'Slash']);
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey) return;
    keys[e.code] = true; tapped[e.code] = true;
    typed.push({ code: e.code, key: e.key, repeat: e.repeat });
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    Audio8.unlock();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  window.addEventListener('pointerdown', () => Audio8.unlock());
  window.addEventListener('touchend', () => Audio8.unlock(), { passive: true }); // iOS needs a touchend gesture

  const SETS = {
    // hot-seat player 1 (left side of keyboard)
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['KeyF', 'Space'], b: ['KeyG', 'ShiftLeft'] },
    // hot-seat player 2 (right side of keyboard)
    p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Enter', 'NumpadEnter'], b: ['ShiftRight', 'Slash', 'Period'] },
    // single player: either hand works
    solo: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], a: ['Space', 'Enter', 'KeyF', 'KeyZ', 'NumpadEnter'], b: ['ShiftLeft', 'ShiftRight', 'KeyG', 'KeyX', 'KeyC'] },
  };
  const any = list => list.some(c => keys[c] || tapped[c]);
  /** call once per frame after every controller has been updated */
  function endFrame() { for (const k in tapped) delete tapped[k]; touch.aTap = touch.bTap = false; }
  // virtual joystick / buttons from touch.js (analog x,y in -1..1)
  const touch = { x: 0, y: 0, a: false, b: false, aTap: false, bTap: false };

  function pad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && pads[i];
    if (!p || !p.connected) return null;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, b = n => p.buttons[n] && p.buttons[n].pressed;
    return {
      x: (b(14) || ax < -0.4) ? -1 : (b(15) || ax > 0.4) ? 1 : 0,
      y: (b(12) || ay < -0.4) ? -1 : (b(13) || ay > 0.4) ? 1 : 0,
      a: b(0) || b(7) || b(9), b: b(1) || b(2) || b(3) || b(5),
    };
  }

  class Controller {
    constructor(set, padIndex, useTouch) { this.set = set; this.pad = padIndex; this.touch = !!useTouch; this.s = { x: 0, y: 0, a: false, b: false, aP: false, bP: false, mx: 0, my: 0 }; this.pa = false; this.pb = false; this.py = 0; this.px = 0; }
    update(dt = 1 / 60) {
      const k = SETS[this.set]; const g = this.pad != null ? pad(this.pad) : null;
      let x = (any(k.right) ? 1 : 0) - (any(k.left) ? 1 : 0), y = (any(k.down) ? 1 : 0) - (any(k.up) ? 1 : 0);
      let a = any(k.a), b = any(k.b);
      if (g) { if (!x) x = g.x; if (!y) y = g.y; a = a || g.a; b = b || g.b; }
      let ax = x, ay = y;                                   // analog (touch stick) for movement
      if (this.touch) { if (!x && !y && (touch.x || touch.y)) { ax = touch.x; ay = touch.y; x = Math.abs(touch.x) > 0.5 ? sgn(touch.x) : 0; y = Math.abs(touch.y) > 0.5 ? sgn(touch.y) : 0; } a = a || touch.a || touch.aTap; b = b || touch.b || touch.bTap; }
      const s = this.s;
      s.x = ax; s.y = ay; s.a = a; s.b = b;
      s.aP = a && !this.pa; s.bP = b && !this.pb;
      // menu nudges: one step per new press (with key-repeat style auto repeat)
      s.my = 0; s.mx = 0;
      if (y !== this.py) { s.my = y; this.ry = 0.32; } else if (y) { this.ry -= dt; if (this.ry <= 0) { s.my = y; this.ry = 0.09; } }
      if (x !== this.px) { s.mx = x; this.rx = 0.32; } else if (x) { this.rx -= dt; if (this.rx <= 0) { s.mx = x; this.rx = 0.09; } }
      this.pa = a; this.pb = b; this.py = y; this.px = x;
      return s;
    }
  }
  /** pop typed key events (for text entry / menu shortcuts) */
  function takeTyped() { return typed.splice(0, typed.length); }
  return { keys, Controller, takeTyped, SETS, touch, endFrame };
})();
