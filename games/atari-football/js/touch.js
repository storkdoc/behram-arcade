/* ==========================================================================
   ATARI FOOTBALL — touch.js
   On-screen controls for phones and tablets: a floating virtual joystick on
   the left half of the screen and big ACTION / CYCLE buttons on the right,
   plus a pause button. Writes into Input.touch, which every Controller
   created with useTouch merges with keyboard + gamepad.
   Shown automatically on touch devices (coarse pointer or first touch),
   hidden on desktop. Menus are tapped directly on the canvas (see ui.js).
   ========================================================================== */
const Touch = (() => {
  const st = Input.touch;
  let enabled = false, visible = false, root, zone, base, knob, btnA, btnB, btnP, labA, labB;
  let stickId = null, cx = 0, cy = 0, R = 46, pausePressed = false, fsTried = false;

  const detect = () => (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (('ontouchstart' in window || navigator.maxTouchPoints > 0) && !(window.matchMedia && matchMedia('(pointer: fine)').matches));

  function el(tag, cls, parent, html) { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; parent.appendChild(e); return e; }
  function init() {
    root = document.getElementById('touch');
    zone = el('div', 'tzone', root);
    base = el('div', 'tbase', root); knob = el('div', 'tknob', base);
    btnB = el('div', 'tbtn tb', root, '<b>B</b><span>CYCLE</span>'); labB = btnB.querySelector('span');
    btnA = el('div', 'tbtn ta', root, '<b>A</b><span>ACTION</span>'); labA = btnA.querySelector('span');
    btnP = el('div', 'tbtn tp', root, '<b>II</b>');
    // joystick: touch anywhere in the left zone; the stick re-centres under your thumb
    zone.addEventListener('pointerdown', e => {
      e.preventDefault(); if (stickId !== null) return;
      stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
      const r = root.getBoundingClientRect(); cx = e.clientX - r.left; cy = e.clientY - r.top;
      base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.classList.add('on'); move(e);
    });
    zone.addEventListener('pointermove', e => { if (e.pointerId === stickId) { e.preventDefault(); move(e); } });
    const end = e => { if (e.pointerId !== stickId) return; stickId = null; st.x = st.y = 0; knob.style.transform = 'translate(-50%,-50%)'; base.classList.remove('on'); base.style.left = ''; base.style.top = ''; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    hold(btnA, v => { st.a = v; if (v) st.aTap = true; }); hold(btnB, v => { st.b = v; if (v) st.bTap = true; });
    btnP.addEventListener('pointerdown', e => { e.preventDefault(); pausePressed = true; Audio8.unlock(); });
    // no long-press menus / text selection / double-tap zoom anywhere
    for (const ev of ['contextmenu', 'selectstart', 'dblclick', 'gesturestart']) document.addEventListener(ev, e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (e.target.id !== 'codeInput') e.preventDefault(); }, { passive: false });
    window.addEventListener('touchstart', () => { if (!enabled) setEnabled(true); }, { passive: true });
    window.addEventListener('pointerup', () => { if (enabled) fullscreen(); });
    setEnabled(detect());
  }
  function move(e) {
    const r = root.getBoundingClientRect();
    let dx = e.clientX - r.left - cx, dy = e.clientY - r.top - cy; const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / R, ny = dy / R, mag = Math.hypot(nx, ny);
    if (mag < 0.22) { st.x = st.y = 0; return; }           // dead zone
    st.x = nx / mag * Math.min(1, (mag - 0.22) / 0.6); st.y = ny / mag * Math.min(1, (mag - 0.22) / 0.6);
    const f = Math.hypot(st.x, st.y); if (f > 0.85) { st.x /= f; st.y /= f; }
  }
  function hold(b, set) {
    let id = null;
    b.addEventListener('pointerdown', e => { e.preventDefault(); id = e.pointerId; b.setPointerCapture(id); set(true); b.classList.add('down'); Audio8.unlock(); if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) { } });
    const up = e => { if (e.pointerId !== id) return; id = null; set(false); b.classList.remove('down'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  }
  function fullscreen() {
    if (fsTried) return; fsTried = true;
    const d = document.documentElement, rq = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!rq || document.fullscreenElement || document.webkitFullscreenElement) return;
    try { const p = rq.call(d, { navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { }); } catch (_) { } }).catch(() => { }); } catch (_) { }
  }
  function setEnabled(v) {
    enabled = v; document.documentElement.classList.toggle('touch', v);
    if (window.App) App.touch = v;
  }
  /** show the stick & buttons (during live play) or hide them (menus, play calling) */
  function show(v) {
    if (!root) return;
    v = v && enabled;
    if (v === visible) return; visible = v;
    root.classList.toggle('show', v);
    if (!v) { st.x = st.y = 0; st.a = st.b = false; stickId = null; base.classList.remove('on'); btnA.classList.remove('down'); btnB.classList.remove('down'); }
  }
  function labels(a, b) { if (labA && labA.textContent !== a) labA.textContent = a; if (labB && labB.textContent !== b) labB.textContent = b; }
  function takePause() { const p = pausePressed; pausePressed = false; return p; }
  return { init, show, labels, takePause, get enabled() { return enabled; }, setEnabled };
})();
