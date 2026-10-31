/* AGE OF EMBERS — input: mouse (incl. Mac ctrl-click and trackpad), keyboard, touch (tap select,
   drag box, two-finger pan, pinch zoom, long-press) and gamepad (virtual cursor). */
(function (E) {
  'use strict';
  const I = E.Input = {};
  const keys = new Set();
  I.keys = keys;
  I.init = function (A) {
    I.A = A; const cv = document.getElementById('view');
    const pts = new Map(); let drag = null, pinch = null, lastTap = { t: 0, x: 0, y: 0 }, longT = 0;
    I.mouse = { x: innerWidth / 2, y: innerHeight / 2, inside: false, t: 0 };
    const pos = (e) => [e.clientX, e.clientY];
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      E.Audio.init(); if (!A.G || A.screen !== 'game') return;
      try { cv.setPointerCapture(e.pointerId); } catch (er) { }
      const [x, y] = pos(e); const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (touch) { A.touchUI = true; document.body.classList.add('touch'); }
      pts.set(e.pointerId, { x, y, x0: x, y0: y, t: performance.now(), touch });
      if (touch) {
        if (pts.size === 2) { // pinch/pan
          clearTimeout(longT); drag = null; A.box = null;
          const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, z: A.R.cam.z };
          if (A.mode && A.mode.wall) A.mode.start = null;
          return;
        }
        if (pts.size > 2) return;
        drag = { x0: x, y0: y, x, y, touch: true, moved: false, btn: 0 };
        if (A.mode && A.mode.build) { A.hoverAt(x, y); if (A.mode.wall) A.wallStart(x, y); }
        clearTimeout(longT); longT = setTimeout(() => { if (drag && !drag.moved && pts.size === 1) { drag.long = true; A.clickSelect(x, y, false, true); } }, 520);
        return;
      }
      // mouse / trackpad
      if (e.button === 1) { drag = { pan: true, x, y }; e.preventDefault(); return; }
      const right = e.button === 2 || (e.button === 0 && e.ctrlKey && !e.metaKey && navigator.platform.indexOf('Mac') >= 0);
      if (right) { A.rightClick(x, y, e.shiftKey); return; }
      if (e.button !== 0) return;
      if (A.mode && A.mode.build) { if (A.mode.wall) { A.wallStart(x, y); drag = { wall: true, x, y }; } else A.placeAt(x, y, e.shiftKey); return; }
      if (A.mode && (A.mode.am || A.mode.rally)) { A.modeClick(x, y, e.shiftKey); return; }
      drag = { x0: x, y0: y, x, y, btn: 0, moved: false, add: e.shiftKey };
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e); I.mouse.x = x; I.mouse.y = y; I.mouse.inside = true; I.mouse.t = performance.now(); if (e.pointerType === 'mouse') { I.mouse.mouse = true; A.cursorHidden(); }
      if (!A.G || A.screen !== 'game') return;
      const p = pts.get(e.pointerId); if (p) { p.x = x; p.y = y; }
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        A.pan(pinch.cx - cx, pinch.cy - cy); pinch.cx = cx; pinch.cy = cy;
        A.zoomTo(pinch.z * d / Math.max(20, pinch.d), cx, cy); return;
      }
      if (drag && drag.pan) { A.pan(drag.x - x, drag.y - y); drag.x = x; drag.y = y; return; }
      if (drag && drag.wall) { A.hoverAt(x, y); return; }
      if (drag) {
        drag.x = x; drag.y = y; if (Math.hypot(x - drag.x0, y - drag.y0) > (drag.touch ? 12 : 6)) drag.moved = true;
        if (drag.touch && A.mode && A.mode.build) { A.hoverAt(x, y); return; }
        if (drag.moved && !drag.long) A.box = { x0: drag.x0, y0: drag.y0, x1: x, y1: y };
      } else A.hoverAt(x, y);
    });
    const up = (e) => {
      const [x, y] = pos(e); const p = pts.get(e.pointerId); pts.delete(e.pointerId); clearTimeout(longT);
      if (!A.G || A.screen !== 'game') { drag = null; return; }
      if (pinch) { if (pts.size < 2) { pinch = null; drag = null; } return; }
      if (!drag) return;
      const d = drag; drag = null;
      if (d.pan) return;
      if (d.wall) { A.wallEnd(x, y, e.shiftKey); return; }
      if (d.touch) {
        if (d.long) return;
        if (A.mode && A.mode.build) { if (A.mode.wall) A.wallEnd(x, y); else A.placeAt(x, y); return; }
        if (d.moved) { A.boxSelect(d.x0, d.y0, x, y, false); A.box = null; return; }
        const now = performance.now(), dbl = now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30; lastTap = { t: now, x, y };
        A.tap(x, y, dbl); return;
      }
      if (d.moved) { A.boxSelect(d.x0, d.y0, x, y, d.add); A.box = null; return; }
      const now = performance.now(), dbl = now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 8; lastTap = { t: now, x, y };
      A.clickSelect(x, y, d.add, dbl);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); drag = null; pinch = null; A.box = null; });
    cv.addEventListener('pointerleave', () => { I.mouse.inside = false; });
    document.addEventListener('mouseleave', () => { I.mouse.inside = false; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); if (!A.G || A.screen !== 'game') return;
      if (e.ctrlKey) { A.zoomTo(A.R.cam.z * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); return; }
      const trackpad = e.deltaMode === 0 && (e.deltaX !== 0 || (Math.abs(e.deltaY) < 40 && e.deltaY % 1 !== 0));
      if (trackpad) A.pan(e.deltaX, e.deltaY);
      else A.zoomTo(A.R.cam.z * Math.exp(-Math.sign(e.deltaY) * 0.12), e.clientX, e.clientY);
    }, { passive: false });
    // Safari gesture events (trackpad pinch on older macOS)
    let gz = 1; cv.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = A.R ? A.R.cam.z : 1; }); cv.addEventListener('gesturechange', (e) => { e.preventDefault(); if (A.R && A.screen === 'game') A.zoomTo(gz * e.scale, e.clientX || innerWidth / 2, e.clientY || innerHeight / 2); });
    // minimap
    const mm = () => document.getElementById('mm');
    let mmDrag = false;
    document.addEventListener('pointerdown', (e) => { if (e.target.id !== 'mm' || !A.G) return; E.Audio.init(); e.preventDefault(); const r = e.target.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const [wx, wy] = A.R.minimapToWorld(e.target, mx, my); if (e.button === 2 || (e.ctrlKey && e.button === 0)) { A.commandWorld(wx, wy); return; } if (A.sel.length && A.touchUI && e.pointerType === 'touch' && A.mode && A.mode.am) { A.commandWorld(wx, wy, true); return; } mmDrag = true; A.R.centerOn(wx, wy); });
    document.addEventListener('pointermove', (e) => { if (!mmDrag) return; const m = mm(); const r = m.getBoundingClientRect(); const [wx, wy] = A.R.minimapToWorld(m, e.clientX - r.left, e.clientY - r.top); A.R.centerOn(wx, wy); });
    document.addEventListener('pointerup', () => { mmDrag = false; });
    document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('#hud')) e.preventDefault(); });
    // keyboard
    addEventListener('keydown', (e) => {
      if (e.key === '`' || e.code === 'Backquote') return; // MoodSticker
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      E.Audio.init();
      keys.add(e.code);
      if (A.screen !== 'game') { if (A.menuKey(e)) e.preventDefault(); return; }
      const k = e.key, ctrl = e.ctrlKey || e.metaKey;
      if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code[5]; if (ctrl) A.setGroup(n); else if (e.shiftKey) A.addGroup(n); else A.recallGroup(n); e.preventDefault(); return; }
      if (ctrl) return;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) A.idleVillager(); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); if (!e.repeat) A.special(); return; }
      if (e.code === 'Escape') { e.preventDefault(); A.escape(); return; }
      if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); A.del(); return; }
      if (e.code === 'Period') { A.idleMilitary(); return; }
      if (e.code === 'KeyH' && !A.sel.length) { A.goTC(); return; }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') { A.cycleSpeed(1); return; }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') { A.cycleSpeed(-1); return; }
      if (e.code === 'Pause' || e.code === 'F3') { A.togglePause(); e.preventDefault(); return; }
      if (e.code === 'F1' || k === '?') { A.pauseMenu('help'); e.preventDefault(); return; }
      if (e.code === 'Home') { A.centerSel(); return; }
      if (e.code.startsWith('Key') && E.UI.hotkey(e.code[3])) { e.preventDefault(); return; }
      if (e.code === 'KeyH') { A.goTC(); return; }
      if (e.code === 'KeyM' && e.shiftKey) { E.Audio.toggleMute(); return; }
    });
    addEventListener('keyup', (e) => { keys.delete(e.code); });
    addEventListener('blur', () => keys.clear());
  };
  // continuous input: arrow-key pan, edge scrolling, gamepad
  const gp = { prev: [], cursor: null, aDown: null, rep: 0 };
  I.gp = gp;
  I.poll = function (dt) {
    const A = I.A;
    if (A.screen === 'game' && A.G) {
      let px = 0, py = 0; const sp = 900 * dt;
      if (keys.has('ArrowLeft')) px -= sp; if (keys.has('ArrowRight')) px += sp; if (keys.has('ArrowUp')) py -= sp; if (keys.has('ArrowDown')) py += sp;
      const m = I.mouse;
      if (A.settings.edge && m.inside && m.mouse && document.hasFocus() && performance.now() - m.t < 8000 && !A.box) {
        const ed = 6; if (m.x <= ed) px -= sp; if (m.x >= innerWidth - ed - 1) px += sp; if (m.y <= ed) py -= sp; if (m.y >= innerHeight - ed - 1) py += sp;
      }
      if (px || py) A.pan(px, py);
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let pad = null; for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return;
    const b = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
    const pr = (i) => b(i) && !gp.prev[i];
    const rl = (i) => !b(i) && gp.prev[i];
    const ax = (i) => { const v = pad.axes[i] || 0; return Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82; };
    if (A.screen !== 'game') {
      const ny = ax(1), up = pr(12) || (ny < -0.6 && gp.rep <= 0), dn = pr(13) || (ny > 0.6 && gp.rep <= 0), lf = pr(14) || (ax(0) < -0.6 && gp.rep <= 0), rt = pr(15) || (ax(0) > 0.6 && gp.rep <= 0);
      if (Math.abs(ny) > 0.6 || Math.abs(ax(0)) > 0.6) { if (gp.rep <= 0) gp.rep = 0.22; else gp.rep -= dt; } else gp.rep = 0;
      if (up) A.menuNav(-1, 0); if (dn) A.menuNav(1, 0); if (lf) A.menuNav(0, -1); if (rt) A.menuNav(0, 1);
      if (pr(0)) { E.Audio.init(); A.menuNav(0, 0, 'ok'); } if (pr(1)) A.menuNav(0, 0, 'back'); if (pr(9)) A.menuNav(0, 0, 'start');
    } else if (A.G) {
      A.touchUI = false;
      if (!gp.cursor) gp.cursor = { x: innerWidth / 2, y: innerHeight / 2 };
      const c = gp.cursor; const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
      const sp = 950 * dt; c.x += lx * Math.abs(lx) * sp; c.y += ly * Math.abs(ly) * sp;
      const mg = 30; let px = 0, py = 0; if (c.x < mg) { px = c.x - mg; c.x = mg; } if (c.x > innerWidth - mg) { px = c.x - innerWidth + mg; c.x = innerWidth - mg; } if (c.y < mg) { py = c.y - mg; c.y = mg; } if (c.y > innerHeight - mg) { py = c.y - innerHeight + mg; c.y = innerHeight - mg; }
      px += rx * 900 * dt; py += ry * 900 * dt; if (px || py) A.pan(px, py);
      if (lx || ly || rx || ry || pad.buttons.some(x => x.pressed)) { A.showCursor(c.x, c.y); if (lx || ly) A.hoverAt(c.x, c.y); }
      // A: select (hold + move = box)
      if (pr(0)) { E.Audio.init(); if (A.mode && A.mode.build) { if (A.mode.wall) A.wallStart(c.x, c.y); else A.placeAt(c.x, c.y); } else if (A.mode && (A.mode.am || A.mode.rally)) A.modeClick(c.x, c.y); else gp.aDown = { x: c.x, y: c.y }; }
      if (b(0) && gp.aDown && Math.hypot(c.x - gp.aDown.x, c.y - gp.aDown.y) > 10) A.box = { x0: gp.aDown.x, y0: gp.aDown.y, x1: c.x, y1: c.y };
      if (rl(0)) { if (A.mode && A.mode.wall) A.wallEnd(c.x, c.y); else if (gp.aDown) { if (A.box) { A.boxSelect(gp.aDown.x, gp.aDown.y, c.x, c.y, false); A.box = null; } else { const now = performance.now(); A.clickSelect(c.x, c.y, false, now - (gp.lastA || 0) < 320); gp.lastA = now; } } gp.aDown = null; }
      if (pr(2)) A.rightClick(c.x, c.y, false);
      if (pr(1)) A.escape(true);
      if (pr(3)) A.idleVillager();
      if (pr(6)) A.special();
      if (pr(4)) A.zoomTo(A.R.cam.z / 1.2, c.x, c.y); if (pr(5)) A.zoomTo(A.R.cam.z * 1.2, c.x, c.y);
      if (pr(9)) A.pauseMenu();
      if (pr(10)) A.goTC(); if (pr(11)) A.centerSel();
      // D-pad walks the command card, RT presses it
      const U = E.UI; let f = U.focus === undefined || U.focus === null ? -1 : U.focus;
      if (pr(12) || pr(13) || pr(14) || pr(15)) { if (f < 0) f = 0; else { if (pr(12)) f = (f + 10) % 15; if (pr(13)) f = (f + 5) % 15; if (pr(14)) f = (f + 14) % 15; if (pr(15)) f = (f + 1) % 15; } U.focus = f; U.lastSig = ''; const t = U.cells[f]; if (t) { U.showTipFor(t); clearTimeout(U._tt); U._tt = setTimeout(U.hideTip, 2200); } }
      if (pr(7) && f >= 0) U.press(f);
    }
    gp.prev = pad.buttons.map(x => x.pressed || x.value > 0.5);
  };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
