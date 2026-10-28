/* NEURO STORM — keyboard + gamepad play (shared by the classic and the GPU cortex).
   A reticle you aim with the arrow keys or the left stick picks the neuron under it.
   SPACE / A  = main action: stimulate that neuron (hold in 50 Hz-train mode for a train)
   ENTER / X or B = special: a thalamic volley into layer IV (GPU cortex) or a 3x pulse (classic)
   SHIFT+arrows / right stick rotate the brain · + / - and LT / RT zoom · P / START pause
   gamepad: Y demo, LB / RB slower / faster, BACK reset. Mouse and touch keep working; the reticle
   hides as soon as the pointer is used and comes back with the next key or stick input. */
export function installPadKeys(A) {
  const el = document.createElement('div'); el.id = 'reticle'; el.setAttribute('aria-hidden', 'true'); el.hidden = true;
  el.innerHTML = '<i></i><b></b>'; document.body.appendChild(el);
  const st = { x: 0, y: 0, shown: false, keys: new Set(), prev: [], padHold: false, keyHold: false, flashT: 0, lastPad: 0 };
  const clampXY = () => { st.x = Math.max(8, Math.min(innerWidth - 8, st.x)); st.y = Math.max(8, Math.min(innerHeight - 8, st.y)); };
  function show() { if (!st.shown) { const c = A.center(); st.x = c.x; st.y = c.y; st.shown = true; el.hidden = false; place(); } }
  function hide() { st.shown = false; el.hidden = true; }
  function place() { clampXY(); el.style.transform = `translate(${Math.round(st.x)}px, ${Math.round(st.y)}px)`; }
  function flash(cls) { el.classList.remove('hit', 'miss', 'spec'); void el.offsetWidth; el.classList.add(cls); }
  const aimed = () => A.pick(st.x, st.y, 30);
  function main(down) {
    show();
    if (!down) { if (st.keyHold || st.padHold) A.hold(null); st.keyHold = st.padHold = false; return false; }
    const i = aimed(); if (i == null) { flash('miss'); return false; }
    A.stopDemo(); flash('hit');
    if (A.isTrain()) { A.select(i); A.hold(i); return true; }
    A.stimulate(i); return false;
  }
  function special() { show(); const i = aimed(); if (i == null) { flash('miss'); return; } A.stopDemo(); flash('spec'); A.special(i); }
  // pointer use hides the reticle (mouse / touch users never see it unless they press a key)
  addEventListener('pointerdown', () => { if (st.shown) hide(); }, true);
  const skip = e => (e.target.tagName === 'INPUT' && (e.target.type === 'range' || e.target.type === 'text')) || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA';
  addEventListener('keydown', e => {
    const k = e.key; st.shift = e.shiftKey;
    if (k === ' ' || k === 'Enter') {
      if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
      e.preventDefault(); if (e.target.blur && e.target !== document.body) e.target.blur();
      if (e.repeat) return;
      if (k === ' ') st.keyHold = main(true); else special();
      return;
    }
    if (k.startsWith('Arrow')) {
      if (skip(e)) return; e.preventDefault(); st.keys.add(k);
      if (!e.repeat) { // a tap is one precise step, so aiming works even when the frame rate is low
        const sx = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0, sy = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0;
        if (e.shiftKey) { A.rotate(sx * 24, sy * 24); A.release(); } else if (st.shown) { st.x += sx * 14; st.y += sy * 14; place(); }
      }
      if (!e.shiftKey) show(); return;
    }
    if (k === '+' || k === '=') { A.zoom(0.88); } else if (k === '-' || k === '_') { A.zoom(1.14); }
  }, true);
  addEventListener('keyup', e => { st.shift = e.shiftKey; if (e.key === ' ' && st.keyHold) main(false); if (e.key.startsWith('Arrow')) { st.keys.delete(e.key); if (e.shiftKey || !st.keys.size) A.release(); } });
  addEventListener('blur', () => { st.keys.clear(); if (st.keyHold) main(false); });
  let last = performance.now();
  const dz = v => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (st.keys.size) {
      const kx = (st.keys.has('ArrowRight') ? 1 : 0) - (st.keys.has('ArrowLeft') ? 1 : 0), ky = (st.keys.has('ArrowDown') ? 1 : 0) - (st.keys.has('ArrowUp') ? 1 : 0);
      if (st.shift) A.rotate(kx * 520 * dt, ky * 520 * dt); else { st.x += kx * 420 * dt; st.y += ky * 420 * dt; place(); }
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null;
    for (const p of pads || []) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5)), was = i => !!st.prev[i];
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    const dx = lx + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dy = ly + (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    if (dx || dy) { show(); st.x += dx * 520 * dt; st.y += dy * 520 * dt; place(); }
    if (rx || ry) A.rotate(rx * 560 * dt, ry * 560 * dt); else if (st.rot) A.release();
    st.rot = !!(rx || ry);
    const lt = gp.buttons[6] ? gp.buttons[6].value : 0, rt = gp.buttons[7] ? gp.buttons[7].value : 0;
    if (lt > 0.1) A.zoom(1 + lt * 1.2 * dt); if (rt > 0.1) A.zoom(1 - rt * 1.0 * dt);
    if (b(0) && !was(0)) st.padHold = main(true); else if (!b(0) && was(0) && st.padHold) main(false);
    if ((b(2) && !was(2)) || (b(1) && !was(1))) special();
    if (b(3) && !was(3)) A.demo();
    if (b(4) && !was(4)) A.speed(1 / 1.4); if (b(5) && !was(5)) A.speed(1.4);
    if (b(9) && !was(9)) A.togglePause();
    if (b(8) && !was(8)) A.reset();
    st.prev = gp.buttons.map(x => x.pressed || x.value > 0.5);
  }
  addEventListener('gamepadconnected', () => { show(); A.caption && A.caption('<b>Gamepad connected.</b> Left stick aims, <b>A</b> stimulates, <b>X</b> sends a special volley, right stick rotates, triggers zoom.', 6); });
  requestAnimationFrame(tick);
  return { show, hide, state: st, aimed };
}
