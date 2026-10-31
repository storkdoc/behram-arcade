/* AGE OF EMBERS — DOM HUD: resource bar, minimap frame, selection panel, command card with
   hotkeys and tooltips, alerts, banners and objectives. Icons are painted procedurally. */
(function (E) {
  'use strict';
  const D = E.D, S = E.Sprites;
  /* ------------------------------------------------------------ procedural icons */
  const IC = E.Icons = {}; const icache = new Map();
  function can(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
  const P = {
    food(x) { // drumstick + berries
      x.fillStyle = '#7a3b1c'; x.beginPath(); x.ellipse(30, 30, 15, 11, -0.7, 0, 6.28); x.fill();
      x.fillStyle = '#c0652e'; x.beginPath(); x.ellipse(28, 28, 12, 8, -0.7, 0, 6.28); x.fill();
      x.fillStyle = '#efe2c8'; x.fillRect(38, 36, 12, 5); x.beginPath(); x.arc(51, 35, 4, 0, 6.28); x.arc(51, 43, 4, 0, 6.28); x.fill();
      for (const [a, b] of [[16, 46], [22, 50], [12, 52]]) { x.fillStyle = '#7d1430'; x.beginPath(); x.arc(a, b, 5.5, 0, 6.28); x.fill(); x.fillStyle = '#d9446b'; x.beginPath(); x.arc(a - 1.5, b - 1.5, 2.6, 0, 6.28); x.fill(); }
    },
    wood(x) { for (const [a, b, l] of [[10, 40, 44], [16, 28, 40], [14, 50, 40]]) { x.fillStyle = '#6a4120'; x.fillRect(a, b - 6, l, 12); x.fillStyle = '#8b5a2e'; x.fillRect(a, b - 6, l, 4); x.fillStyle = '#e0b878'; x.beginPath(); x.ellipse(a + l, b, 4, 6, 0, 0, 6.28); x.fill(); x.strokeStyle = '#9c6c38'; x.lineWidth = 1; x.beginPath(); x.ellipse(a + l, b, 2, 3, 0, 0, 6.28); x.stroke(); } },
    gold(x) { for (const [a, b, r] of [[22, 40, 11], [40, 42, 10], [31, 27, 10]]) { x.fillStyle = '#8a5e0a'; x.beginPath(); x.moveTo(a - r, b + 4); x.lineTo(a - r * 0.4, b - r); x.lineTo(a + r * 0.7, b - r * 0.8); x.lineTo(a + r, b + 3); x.lineTo(a, b + r * 0.8); x.fill(); x.fillStyle = '#f2c53a'; x.beginPath(); x.moveTo(a - r * 0.6, b + 1); x.lineTo(a - r * 0.3, b - r * 0.8); x.lineTo(a + r * 0.5, b - r * 0.6); x.lineTo(a + r * 0.2, b + 2); x.fill(); x.fillStyle = '#fff3b0'; x.fillRect(a - 2, b - r * 0.5, 3, 3); } },
    stone(x) { for (const [a, b, r, c] of [[24, 40, 13, '#8d8a84'], [42, 44, 10, '#77746e'], [34, 26, 10, '#a3a09a']]) { x.fillStyle = '#4b4945'; x.beginPath(); x.ellipse(a, b + 2, r, r * 0.8, 0, 0, 6.28); x.fill(); x.fillStyle = c; x.beginPath(); x.ellipse(a - 1, b, r * 0.9, r * 0.7, 0, 0, 6.28); x.fill(); x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(a - r * 0.3, b - r * 0.3, r * 0.4, r * 0.2, -0.4, 0, 6.28); x.fill(); } },
    pop(x) { x.fillStyle = '#e9d7b0'; x.beginPath(); x.arc(32, 20, 9, 0, 6.28); x.fill(); x.beginPath(); x.moveTo(14, 54); x.quadraticCurveTo(16, 32, 32, 31); x.quadraticCurveTo(48, 32, 50, 54); x.fill(); },
    idle(x) { P.pop(x); x.fillStyle = '#ffd36b'; x.font = 'bold 18px sans-serif'; x.fillText('z', 44, 20); x.font = 'bold 13px sans-serif'; x.fillText('z', 52, 10); },
    sword(x) { x.save(); x.translate(32, 32); x.rotate(-0.8); x.fillStyle = '#dfe6ee'; x.beginPath(); x.moveTo(-3, 10); x.lineTo(-3, -22); x.lineTo(0, -27); x.lineTo(3, -22); x.lineTo(3, 10); x.fill(); x.fillStyle = '#9aa6b2'; x.fillRect(0, -22, 3, 32); x.fillStyle = '#c99a2e'; x.fillRect(-10, 10, 20, 4); x.fillStyle = '#5a3a1e'; x.fillRect(-2, 14, 4, 10); x.fillStyle = '#c99a2e'; x.beginPath(); x.arc(0, 25, 3, 0, 6.28); x.fill(); x.restore(); },
    swords(x) { x.save(); P.sword(x); x.restore(); x.save(); x.translate(64, 0); x.scale(-1, 1); P.sword(x); x.restore(); },
    arrow(x) { x.save(); x.translate(32, 32); x.rotate(-0.8); x.strokeStyle = '#8b5a2b'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 24); x.lineTo(0, -18); x.stroke(); x.fillStyle = '#c9d2dc'; x.beginPath(); x.moveTo(0, -27); x.lineTo(-6, -16); x.lineTo(6, -16); x.fill(); x.fillStyle = '#e8e0d0'; x.beginPath(); x.moveTo(0, 14); x.lineTo(-6, 24); x.lineTo(-6, 18); x.lineTo(0, 9); x.moveTo(0, 14); x.lineTo(6, 24); x.lineTo(6, 18); x.lineTo(0, 9); x.fill(); x.restore(); },
    shield(x) { x.fillStyle = '#5b3a1e'; x.beginPath(); x.moveTo(32, 8); x.lineTo(52, 15); x.quadraticCurveTo(52, 44, 32, 57); x.quadraticCurveTo(12, 44, 12, 15); x.closePath(); x.fill(); x.fillStyle = '#9a6a34'; x.beginPath(); x.moveTo(32, 12); x.lineTo(48, 18); x.quadraticCurveTo(48, 42, 32, 52); x.quadraticCurveTo(16, 42, 16, 18); x.closePath(); x.fill(); x.fillStyle = '#d9b24a'; x.beginPath(); x.arc(32, 30, 6, 0, 6.28); x.fill(); },
    pshield(x) { P.shield(x); x.save(); x.scale(0.55, 0.55); x.translate(30, 30); P.arrow(x); x.restore(); },
    bow(x) { x.strokeStyle = '#7a4a22'; x.lineWidth = 4; x.beginPath(); x.arc(14, 32, 26, -1.1, 1.1); x.stroke(); x.strokeStyle = '#eee'; x.lineWidth = 1; x.beginPath(); x.moveTo(14 + 26 * Math.cos(-1.1), 32 + 26 * Math.sin(-1.1)); x.lineTo(14 + 26 * Math.cos(1.1), 32 + 26 * Math.sin(1.1)); x.stroke(); },
    eye(x) { x.fillStyle = '#efe2c8'; x.beginPath(); x.moveTo(8, 32); x.quadraticCurveTo(32, 10, 56, 32); x.quadraticCurveTo(32, 54, 8, 32); x.fill(); x.fillStyle = '#3d6fa8'; x.beginPath(); x.arc(32, 32, 9, 0, 6.28); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(32, 32, 4, 0, 6.28); x.fill(); },
    boot(x) { x.fillStyle = '#7a4a22'; x.beginPath(); x.moveTo(22, 10); x.lineTo(36, 10); x.lineTo(36, 40); x.lineTo(54, 46); x.lineTo(54, 54); x.lineTo(20, 54); x.closePath(); x.fill(); },
    stop(x) { x.fillStyle = '#a3241c'; x.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; x.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22); } x.fill(); x.strokeStyle = '#f3e0d0'; x.lineWidth = 3; x.stroke(); x.fillStyle = '#fff'; x.fillRect(20, 29, 24, 6); },
    amove(x) { P.sword(x); x.strokeStyle = '#ff7a4a'; x.lineWidth = 4; x.beginPath(); x.moveTo(8, 54); x.lineTo(24, 54); x.stroke(); x.fillStyle = '#ff7a4a'; x.beginPath(); x.moveTo(30, 54); x.lineTo(20, 47); x.lineTo(20, 61); x.fill(); },
    del(x) { x.strokeStyle = '#d33'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.moveTo(18, 18); x.lineTo(46, 46); x.moveTo(46, 18); x.lineTo(18, 46); x.stroke(); },
    more(x) { x.fillStyle = '#ffd77d'; x.beginPath(); x.moveTo(22, 14); x.lineTo(44, 32); x.lineTo(22, 50); x.fill(); },
    back(x) { x.fillStyle = '#ffd77d'; x.beginPath(); x.moveTo(42, 14); x.lineTo(20, 32); x.lineTo(42, 50); x.fill(); },
    fline(x) { x.fillStyle = '#ffd77d'; for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) { x.beginPath(); x.arc(12 + i * 10, 26 + j * 12, 4, 0, 6.28); x.fill(); } },
    fbox(x) { x.fillStyle = '#ffd77d'; for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; x.beginPath(); x.arc(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18, 4, 0, 6.28); x.fill(); } x.fillStyle = '#9ad1ff'; for (const [a, b] of [[28, 28], [36, 28], [28, 36], [36, 36]]) { x.beginPath(); x.arc(a, b, 3.5, 0, 6.28); x.fill(); } },
    fspread(x) { x.fillStyle = '#ffd77d'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { x.beginPath(); x.arc(14 + i * 18, 14 + j * 18, 4, 0, 6.28); x.fill(); } },
    age(x) { const g = x.createRadialGradient(32, 36, 2, 32, 36, 26); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.4, '#ffb347'); g.addColorStop(1, 'rgba(255,90,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.fillStyle = '#fff2c4'; x.beginPath(); x.moveTo(32, 8); x.quadraticCurveTo(46, 30, 38, 46); x.quadraticCurveTo(32, 54, 26, 46); x.quadraticCurveTo(18, 30, 32, 8); x.fill(); x.fillStyle = '#ff8a2a'; x.beginPath(); x.moveTo(32, 22); x.quadraticCurveTo(40, 36, 35, 45); x.quadraticCurveTo(32, 49, 29, 45); x.quadraticCurveTo(24, 36, 32, 22); x.fill(); },
    loom(x) { x.strokeStyle = '#7a4a22'; x.lineWidth = 4; x.strokeRect(12, 12, 40, 40); x.strokeStyle = '#e8d4a8'; x.lineWidth = 2; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(16 + i * 6.5, 14); x.lineTo(16 + i * 6.5, 50); x.stroke(); } x.strokeStyle = '#c0392b'; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(14, 18 + i * 7); x.lineTo(50, 18 + i * 7); x.stroke(); } },
    cart(x) { x.fillStyle = '#8b5a2b'; x.fillRect(10, 24, 40, 14); x.fillStyle = '#5a3a1e'; x.beginPath(); x.arc(22, 44, 9, 0, 6.28); x.fill(); x.fillStyle = '#c9a26a'; x.beginPath(); x.arc(22, 44, 4, 0, 6.28); x.fill(); x.strokeStyle = '#5a3a1e'; x.lineWidth = 3; x.beginPath(); x.moveTo(50, 28); x.lineTo(60, 22); x.stroke(); x.fillStyle = '#6a8a2a'; x.beginPath(); x.ellipse(30, 22, 16, 6, 0, 0, 6.28); x.fill(); },
    axe(x) { x.save(); x.translate(32, 32); x.rotate(0.6); x.fillStyle = '#7a4a22'; x.fillRect(-2.5, -24, 5, 50); x.fillStyle = '#cfd6de'; x.beginPath(); x.moveTo(2, -22); x.quadraticCurveTo(22, -20, 20, -4); x.lineTo(2, -8); x.fill(); x.restore(); },
    pick(x) { x.save(); x.translate(32, 34); x.rotate(-0.5); x.fillStyle = '#7a4a22'; x.fillRect(-2.5, -18, 5, 44); x.fillStyle = '#cfd6de'; x.beginPath(); x.moveTo(-24, -10); x.quadraticCurveTo(0, -28, 24, -10); x.quadraticCurveTo(0, -20, -24, -10); x.fill(); x.restore(); },
    plow(x) { x.fillStyle = '#8b6a2a'; for (let i = 0; i < 4; i++) { x.fillRect(8, 14 + i * 11, 48, 5); } x.fillStyle = '#d8b44a'; for (let i = 0; i < 8; i++) { x.beginPath(); x.ellipse(12 + i * 6, 12 + (i % 2) * 22, 2, 6, 0.3, 0, 6.28); x.fill(); } },
    horse(x) { x.fillStyle = '#7a4a22'; x.beginPath(); x.moveTo(20, 56); x.lineTo(24, 30); x.quadraticCurveTo(26, 12, 40, 10); x.lineTo(50, 18); x.lineTo(46, 24); x.lineTo(38, 22); x.quadraticCurveTo(36, 36, 44, 56); x.closePath(); x.fill(); x.fillStyle = '#3a2210'; x.beginPath(); x.moveTo(30, 14); x.quadraticCurveTo(22, 22, 24, 34); x.lineTo(28, 30); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(41, 15, 1.8, 0, 6.28); x.fill(); },
    up(x) { x.fillStyle = '#ffd77d'; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(14, 30 + i * 10 - 6); x.lineTo(32, 14 + i * 10 - 6); x.lineTo(50, 30 + i * 10 - 6); x.lineTo(50, 36 + i * 10 - 6); x.lineTo(32, 20 + i * 10 - 6); x.lineTo(14, 36 + i * 10 - 6); x.fill(); } },
    fish(x) { x.fillStyle = '#5a9ac8'; x.beginPath(); x.ellipse(30, 32, 18, 9, 0, 0, 6.28); x.fill(); x.beginPath(); x.moveTo(46, 32); x.lineTo(58, 22); x.lineTo(58, 42); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(20, 30, 2, 0, 6.28); x.fill(); },
    brick(x) { for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { x.fillStyle = (r + c) % 2 ? '#b0553a' : '#9a4630'; x.fillRect(6 + c * 18 - (r % 2) * 9, 12 + r * 11, 16, 9); } },
    tower(x) { x.fillStyle = '#8d8a84'; x.fillRect(22, 18, 20, 38); x.fillStyle = '#6f6c66'; x.fillRect(18, 12, 28, 8); for (let i = 0; i < 4; i++) x.fillRect(18 + i * 8, 6, 5, 7); x.fillStyle = '#222'; x.fillRect(29, 28, 6, 10); },
    coin(x) { x.fillStyle = '#8a5e0a'; x.beginPath(); x.arc(32, 33, 20, 0, 6.28); x.fill(); x.fillStyle = '#f2c53a'; x.beginPath(); x.arc(31, 31, 18, 0, 6.28); x.fill(); x.fillStyle = '#b6860e'; x.font = 'bold 22px serif'; x.textAlign = 'center'; x.fillText('E', 31, 39); },
    menu(x) { x.fillStyle = '#f3e3bf'; for (let i = 0; i < 3; i++) x.fillRect(14, 18 + i * 12, 36, 5); },
    pause(x) { x.fillStyle = '#f3e3bf'; x.fillRect(18, 14, 10, 36); x.fillRect(36, 14, 10, 36); },
    play(x) { x.fillStyle = '#f3e3bf'; x.beginPath(); x.moveTo(20, 14); x.lineTo(48, 32); x.lineTo(20, 50); x.fill(); },
    army(x) { P.swords(x); },
    deselect(x) { P.del(x); },
    bell(x) { x.fillStyle = '#d9a83a'; x.beginPath(); x.moveTo(32, 10); x.quadraticCurveTo(48, 12, 48, 40); x.lineTo(54, 48); x.lineTo(10, 48); x.lineTo(16, 40); x.quadraticCurveTo(16, 12, 32, 10); x.fill(); x.beginPath(); x.arc(32, 52, 5, 0, 6.28); x.fill(); },
    hammer(x) { x.save(); x.translate(32, 32); x.rotate(-0.6); x.fillStyle = '#7a4a22'; x.fillRect(-2.5, -14, 5, 40); x.fillStyle = '#9aa6b2'; x.fillRect(-14, -22, 28, 12); x.restore(); },
    rally(x) { x.strokeStyle = '#5a3a1e'; x.lineWidth = 3; x.beginPath(); x.moveTo(20, 56); x.lineTo(20, 8); x.stroke(); x.fillStyle = '#e3b860'; x.beginPath(); x.moveTo(22, 9); x.lineTo(50, 18); x.lineTo(22, 28); x.fill(); },
    farmauto(x) { P.plow(x); }
  };
  IC.get = function (name, size) {
    size = size || 64; const k = name + size; let v = icache.get(k); if (v) return v;
    const [c, x] = can(size); x.scale(size / 64, size / 64);
    if (P[name]) P[name](x);
    v = c.toDataURL(); icache.set(k, v); return v;
  };
  IC.trade = function (res, buy) {
    const k = 'trade' + res + buy; let v = icache.get(k); if (v) return v;
    const [c, x] = can(64); x.save(); x.translate(6, 4); x.scale(0.72, 0.72); P[res === 'f' ? 'food' : res === 'w' ? 'wood' : 'stone'](x); x.restore();
    x.save(); x.translate(30, 30); x.scale(0.5, 0.5); P.coin(x); x.restore();
    x.fillStyle = buy ? '#7ee06a' : '#ff8a6a'; x.font = 'bold 22px sans-serif'; x.textAlign = 'left'; x.fillText(buy ? '+' : '−', 4, 60);
    v = c.toDataURL(); icache.set(k, v); return v;
  };
  IC.unit = function (type) { const k = 'U' + type; let v = icache.get(k); if (v) return v; v = S.icon('u', type, 96).c.toDataURL(); icache.set(k, v); return v; };
  IC.bld = function (type) { const k = 'B' + type; let v = icache.get(k); if (v) return v; v = S.icon('b', type, 96).c.toDataURL(); icache.set(k, v); return v; };
  IC.res = function (type) {
    const k = 'R' + type; let v = icache.get(k); if (v) return v;
    const [c, x] = can(96); let sp; try { sp = type === 'tree' ? S.tree(0) : type === 'gold' || type === 'stone' ? S.mine(type, 0, 1) : type === 'berry' ? S.berry(0) : type === 'carcass' ? S.carcass(0) : null; } catch (e) { sp = null; }
    if (sp) { const sc = Math.min(80 / sp.w, 80 / sp.h); x.drawImage(sp.c, (96 - sp.w * sc) / 2, (96 - sp.h * sc) / 2, sp.w * sc, sp.h * sc); } else { x.scale(1.5, 1.5); P.fish(x); }
    v = c.toDataURL(); icache.set(k, v); return v;
  };
  IC.clear = () => { for (const k of [...icache.keys()]) if (k[0] === 'U' || k[0] === 'B') icache.delete(k); };
  const RESI = { f: 'food', w: 'wood', g: 'gold', s: 'stone' };

  /* ------------------------------------------------------------ HUD */
  const UI = E.UI = {};
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const HK = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];
  UI.HK = HK;
  UI.build = function (A) {
    UI.A = A; const hud = $('#hud'); hud.innerHTML = '';
    const top = el('div', '', ''); top.id = 'top';
    top.innerHTML = ['f', 'w', 'g', 's'].map(r => `<div class="res" id="r_${r}" data-tip="${D.RESNAME[r]}"><img src="${IC.get(RESI[r], 44)}"><span class="v">0</span><small></small></div>`).join('') +
      `<div class="res" id="r_pop" data-tip="Population / housing"><img src="${IC.get('pop', 44)}"><span class="v">0/0</span></div>` +
      `<div id="age"><span class="nm">HEARTH AGE</span><span class="prog hidden"><i></i></span><span class="clock">0:00</span></div>` +
      `<button class="tbtn" id="b_idle" data-tip="Idle villager <span class=k>Space</span>"><img src="${IC.get('idle', 40)}"><span class="n">0</span></button>` +
      `<button class="tbtn" id="b_speed" data-tip="Game speed <span class=k>+ / −</span>">1×</button>` +
      `<button class="tbtn" id="b_menu" data-tip="Menu <span class=k>Esc</span>"><img src="${IC.get('menu', 40)}"></button>`;
    hud.appendChild(top);
    const bottom = el('div'); bottom.id = 'bottom';
    bottom.innerHTML = `<div id="mmwrap" class="panel"><canvas id="mm"></canvas></div><div id="selp" class="panel"></div><div id="cmdwrap" class="panel"><div id="cmd"></div></div>`;
    hud.appendChild(bottom);
    const al = el('div'); al.id = 'alerts'; hud.appendChild(al);
    const bn = el('div'); bn.id = 'banner'; hud.appendChild(bn);
    const gl = el('div', 'panel hidden'); gl.id = 'goals'; hud.appendChild(gl);
    const wt = el('div', 'panel hidden'); wt.id = 'wonderT'; hud.appendChild(wt);
    const tb = el('div', 'hidden'); tb.id = 'touchbar';
    tb.innerHTML = `<button class="tbtn" id="t_army" data-tip="Select army">⚔</button><button class="tbtn" id="t_idle">☺</button><button class="tbtn" id="t_am" data-tip="Attack-move">➶</button><button class="tbtn" id="t_desel">✕</button>`;
    hud.appendChild(tb);
    const cmd = $('#cmd'); UI.cells = [];
    for (let i = 0; i < 15; i++) { const b = el('button', 'cb empty'); b.dataset.i = i; b.innerHTML = '<img alt=""><span class="hk"></span><span class="q"></span>'; cmd.appendChild(b); UI.cells.push(b); }
    let tip = $('#tip'); if (!tip) { tip = el('div', 'panel hidden'); tip.id = 'tip'; document.body.appendChild(tip); } UI.tip = tip;
    // events
    cmd.addEventListener('pointerdown', (e) => { const b = e.target.closest('.cb'); if (!b) return; e.preventDefault(); e.stopPropagation(); UI.press(+b.dataset.i, e); });
    cmd.addEventListener('contextmenu', e => e.preventDefault());
    hud.addEventListener('pointerover', (e) => { if (e.pointerType === 'touch') return; const t = e.target.closest('[data-tip],.cb'); if (!t) return UI.hideTip(); UI.showTipFor(t); });
    hud.addEventListener('pointerout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip],.cb')) UI.hideTip(); });
    $('#b_idle').onclick = () => A.idleVillager(); $('#t_idle').onclick = () => A.idleVillager();
    $('#b_menu').onclick = () => A.pauseMenu(); $('#b_speed').onclick = () => A.cycleSpeed();
    $('#t_army').onclick = () => A.selectArmy(); $('#t_desel').onclick = () => A.select([]);
    $('#t_am').onclick = () => { A.setMode(A.mode && A.mode.am ? null : { am: true }); };
    gl.addEventListener('click', () => gl.classList.toggle('min'));
    $('#selp').addEventListener('pointerdown', (e) => { const m = e.target.closest('.mini'); if (!m) return; e.stopPropagation(); if (m.dataset.q !== undefined) A.cancelQueue(+m.dataset.b, +m.dataset.q); else if (m.dataset.id) { if (e.shiftKey) A.select(A.sel.filter(i => i !== +m.dataset.id)); else if (m.dataset.type) A.select(A.sel.filter(i => { const u = A.G.get(i); return u && u.type === m.dataset.type; })); else A.select([+m.dataset.id]); } });
    UI.lastSig = ''; UI.alerts = []; UI.page = 0;
  };
  UI.showTipFor = function (t) {
    let html = '';
    if (t.classList.contains('cb')) { const c = UI.card && UI.card[+t.dataset.i]; if (!c) return UI.hideTip(); html = UI.tipHtml(c); }
    else html = t.dataset.tip;
    if (!html) return UI.hideTip();
    const tip = UI.tip; tip.innerHTML = html; tip.classList.remove('hidden');
    const r = t.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 8; if (y < 4) y = r.bottom + 8; x = Math.max(4, Math.min(innerWidth - tw - 4, x));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  UI.hideTip = function () { if (UI.tip) UI.tip.classList.add('hidden'); };
  UI.costHtml = function (cost, p) { return '<div class="cost">' + Object.keys(cost || {}).map(k => `<span class="${p && (p.res[k] || 0) < cost[k] ? 'no' : ''}"><img src="${IC.get(RESI[k], 32)}">${cost[k]}</span>`).join('') + '</div>'; };
  UI.tipHtml = function (c) {
    const p = UI.A.G.players[UI.A.me];
    let h = `<b>${c.title}${c.hk ? ` <span class="k">(${c.hk})</span>` : ''}</b>`;
    if (c.cost && Object.keys(c.cost).length) h += UI.costHtml(c.cost, p);
    if (c.time) h += `<div style="color:#bfa77c">Time ${c.time}s</div>`;
    if (c.desc) h += `<div>${c.desc}</div>`;
    if (c.block) h += `<div class="no">${c.block}</div>`;
    return h;
  };
  UI.press = function (i, e) {
    const c = UI.card && UI.card[i]; if (!c || !c.fn) return;
    if (c.block) { E.Audio.sfx('deny'); UI.alert(c.block, 'red'); return; }
    E.Audio.sfx('click'); c.fn(e || {});
    if (e && e.pointerType === 'touch') { const t = UI.cells[i]; UI.showTipFor(t); clearTimeout(UI._tt); UI._tt = setTimeout(UI.hideTip, 1600); }
    UI.lastSig = ''; // force refresh
  };
  UI.hotkey = function (k) { const i = HK.indexOf(k.toUpperCase()); if (i < 0) return false; const c = UI.card && UI.card[i]; if (!c || !c.fn) return false; UI.press(i); return true; };
  /* ------------------------------------------------------------ command card model */
  UI.computeCard = function () {
    const A = UI.A, G = A.G, me = A.me, p = G.players[me]; const cells = new Array(15).fill(null);
    const sel = A.sel.map(id => G.get(id)).filter(Boolean);
    if (!sel.length || sel[0].owner !== me) return cells;
    const f = sel[0];
    if (f.k === 'u') {
      const vil = sel.filter(u => u.type === 'villager');
      if (vil.length && A.cardPage !== 'mil') {
        const ids = vil.map(u => u.id);
        const pages = [['house', 'mill', 'lumbercamp', 'miningcamp', 'farm', 'dock', 'barracks', 'archery', 'stable', 'blacksmith', 'market', 'tower'], ['palisade', 'wall', 'towncenter', 'siegeworks', 'academy', 'wonder']];
        const page = pages[UI.page] || pages[0];
        page.forEach((t, i) => {
          const d = D.BUILD[t]; const blk = G.buildBlock(me, t);
          cells[i] = { icon: IC.bld(t), title: 'Build ' + d.name, cost: d.cost, time: d.time, desc: d.desc, block: blk, poor: !G.canAfford(p, d.cost), fn: () => A.setMode({ build: t, ids }) };
        });
        if (UI.page === 0) cells[12] = { icon: IC.get('more'), title: 'More buildings', desc: 'Walls, Town Center, Siege Works, Academy, Wonder.', fn: () => { UI.page = 1; } };
        else cells[12] = { icon: IC.get('back'), title: 'Back', fn: () => { UI.page = 0; } };
        cells[13] = { icon: IC.get('stop'), title: 'Stop', fn: () => A.stop() };
        cells[14] = { icon: IC.get('del'), title: 'Delete', desc: 'Delete the selected units.', fn: () => A.del() };
        if (sel.length > vil.length) cells[11] = cells[11] || null;
        return cells;
      }
      const milU = sel.filter(u => u.type !== 'villager' && u.type !== 'fishboat');
      if (milU.length) {
        const form = p.formation || 'line';
        cells[0] = { icon: IC.get('amove'), title: 'Attack-move', desc: 'Move and fight anything met on the way. Then click/tap the ground.', fn: () => A.setMode({ am: true }), on: A.mode && A.mode.am };
        cells[1] = { icon: IC.get('stop'), title: 'Stop', fn: () => A.stop() };
        cells[2] = { icon: IC.get('fline'), title: 'Line formation', desc: 'Melee in front, archers behind.', fn: () => { p.formation = 'line'; }, on: form === 'line' };
        cells[3] = { icon: IC.get('fbox'), title: 'Box formation', desc: 'Melee ring protecting archers and siege.', fn: () => { p.formation = 'box'; }, on: form === 'box' };
        cells[4] = { icon: IC.get('fspread'), title: 'Spread formation', desc: 'Loose order — less splash damage from catapults.', fn: () => { p.formation = 'spread'; }, on: form === 'spread' };
        if (sel.some(u => u.type === 'villager')) cells[5] = { icon: IC.get('hammer'), title: 'Villager orders', desc: 'Show build options for the villagers in this group.', fn: () => { A.cardPage = 'vil'; } };
      } else cells[1] = { icon: IC.get('stop'), title: 'Stop', fn: () => A.stop() };
      cells[14] = { icon: IC.get('del'), title: 'Delete', desc: 'Delete the selected units.', fn: () => A.del() };
      return cells;
    }
    if (f.k === 'b') {
      const d = D.BUILD[f.type];
      if (!f.done) { cells[14] = { icon: IC.get('del'), title: 'Cancel construction', desc: 'Refunds the cost if work has not started.', fn: () => A.del() }; return cells; }
      let i = 0;
      const same = sel.filter(b => b.type === f.type && b.done);
      for (const t of d.trains || []) {
        const u = D.UNITS[t], st = G.ustat(me, t); const blk = G.trainBlock(me, t);
        const q = same.reduce((n, b) => n + b.queue.filter(x => x.unit === t).length, 0);
        cells[i++] = { icon: IC.unit(t), title: 'Train ' + st.name, cost: u.cost, time: u.time, desc: u.desc + (u.cls !== 'villager' && st.atk ? ` <br><span style="color:#bfa77c">HP ${st.hp} · Attack ${st.atk} · Armor ${st.am}/${st.ap}${st.ranged ? ' · Range ' + st.range : ''}</span>` : ''), block: blk, poor: !G.canAfford(p, u.cost), count: q, fn: (e) => A.train(t, e && e.shiftKey ? 5 : 1) };
      }
      if (d.trade) {
        for (const r of ['f', 'w', 's']) { const pr = p.prices[r]; cells[5 + ['f', 'w', 's'].indexOf(r)] = { icon: IC.trade(r, true), title: 'Buy 100 ' + D.RESNAME[r], cost: { g: Math.ceil(pr * (1 + p.m.fee)) }, desc: 'Prices rise as you buy.', poor: p.res.g < Math.ceil(pr * (1 + p.m.fee)), fn: () => A.trade(r, true) }; cells[10 + ['f', 'w', 's'].indexOf(r)] = { icon: IC.trade(r, false), title: 'Sell 100 ' + D.RESNAME[r], cost: { [r]: 100 }, desc: `You receive ${Math.floor(pr * (1 - p.m.fee))} gold.`, poor: (p.res[r] || 0) < 100, fn: () => A.trade(r, false) }; }
      }
      const techs = (d.techs || []).filter(k => { const t = D.TECH[k]; if (p.techs[k]) return false; if (t.ageUp) return t.ageUp === p.age + 1; if (t.req && !p.techs[t.req]) { return false; } return true; });
      let slot = d.trade ? 0 : i; const maxSlot = d.trade ? 5 : 14;
      if (d.trade) slot = Math.max(slot, (d.trains || []).length);
      for (const k of techs) {
        while (slot < maxSlot && cells[slot]) slot++; if (slot >= maxSlot) break;
        const t = D.TECH[k], blk = G.techBlock(me, k);
        const q = same.some(b => b.queue.some(x => x.tech === k));
        cells[slot++] = { icon: t.ageUp ? IC.get('age') : IC.get(t.icon || 'up'), title: t.name, cost: t.cost, time: t.time, desc: t.ageUp ? (`Advance to the ${D.AGES[t.ageUp].name}. ` + t.desc) : t.desc, block: q ? 'In progress' : blk, poor: !G.canAfford(p, t.cost || {}), fn: () => A.research(k) };
      }
      if (d.trains) cells[13] = { icon: IC.get('rally'), title: 'Set rally point', desc: 'Right-click (or tap with this selected) anywhere to set where new units gather. Rally on a resource to auto-gather.', fn: () => A.setMode({ rally: true }) };
      cells[14] = { icon: IC.get('del'), title: 'Delete', desc: 'Destroy this building.', fn: () => A.del() };
      return cells;
    }
    return cells;
  };
  /* ------------------------------------------------------------ per-frame refresh */
  const fmt = (n) => { n = Math.floor(n); return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : '' + n; };
  UI.update = function () {
    const A = UI.A, G = A.G, me = A.me, p = G.players[me]; if (!G) return;
    // resources
    const gath = { f: 0, w: 0, g: 0, s: 0 }; let idle = 0;
    for (const u of G.units) if (u.owner === me && u.type === 'villager') { if ((u.st === 'gather' || u.st === 'return') && u.ct) gath[u.ct]++; else if (u.st === 'idle') idle++; } else if (u.owner === me && u.type === 'fishboat' && u.st !== 'idle') gath.f++;
    for (const r of ['f', 'w', 'g', 's']) { const e = UI._r || (UI._r = {}); const n = $('#r_' + r); if (!e[r]) e[r] = { v: n.querySelector('.v'), s: n.querySelector('small'), last: '' }; const sv = fmt(p.res[r]) + '|' + gath[r]; if (sv !== e[r].last) { e[r].v.textContent = fmt(p.res[r]); e[r].s.textContent = gath[r] ? gath[r] : ''; e[r].last = sv; } }
    const pop = $('#r_pop .v'); pop.textContent = p.pop + '/' + Math.min(G.popLimit, p.popCap); pop.style.color = p.pop >= Math.min(G.popLimit, p.popCap) ? '#ff8a70' : '';
    const ib = $('#b_idle'); ib.querySelector('.n').textContent = idle; ib.classList.toggle('warn', idle > 0 && G.time > 20);
    const ag = $('#age'); ag.querySelector('.nm').textContent = D.AGES[p.age].short + ' AGE'; ag.querySelector('.clock').textContent = E.U.fmtTime(G.time) + (A.paused ? ' ❚❚' : '');
    let ap = null; for (const b of G.blds) if (b.owner === me && b.queue.length && b.queue[0].tech && D.TECH[b.queue[0].tech].ageUp) ap = b.queue[0];
    const pr = ag.querySelector('.prog'); pr.classList.toggle('hidden', !ap); if (ap) pr.firstChild.style.width = (ap.t / ap.T * 100).toFixed(1) + '%';
    $('#b_speed').textContent = A.speed + '×';
    // wonder timers
    const wt = $('#wonderT'); const ws = G.players.filter(q => q.wonderT >= 0 && q.alive);
    if (ws.length) { wt.classList.remove('hidden'); wt.innerHTML = ws.map(q => `<div style="color:${S.playerCol(q.id).l}">◆ ${q.name} Wonder: ${E.U.fmtTime(q.wonderT)}</div>`).join(''); } else wt.classList.add('hidden');
    // selection / command card (only when changed)
    UI.updateSel();
    const sig = UI.cardSig();
    if (sig !== UI.lastSig) { UI.lastSig = sig; UI.card = UI.computeCard(); UI.renderCard(); }
    else UI.renderCardCounts();
    // alerts fade
    const now = performance.now(); for (const a of UI.alerts) if (!a.gone && now - a.t > 4200) { a.gone = true; a.e.style.opacity = 0; setTimeout(() => a.e.remove(), 650); }
    UI.alerts = UI.alerts.filter(a => !a.gone || now - a.t < 5000);
    $('#touchbar').classList.toggle('hidden', !A.touchUI);
    $('#t_am').classList.toggle('warn', !!(A.mode && A.mode.am));
  };
  UI.cardSig = function () {
    const A = UI.A, G = A.G, p = G.players[A.me];
    const sel = A.sel.map(id => G.get(id)).filter(Boolean);
    let s = A.sel.length + ':' + (sel[0] ? sel[0].type + sel[0].done + sel[0].owner : '') + ':' + UI.page + ':' + A.cardPage + ':' + p.age + ':' + p.techOrder.length + ':' + (A.mode ? JSON.stringify(Object.keys(A.mode)) : '') + ':' + (p.formation || '');
    s += ':' + ['f', 'w', 'g', 's'].map(r => Math.floor(p.res[r] / 25)).join(',');
    s += ':' + G.blds.filter(b => b.owner === A.me && b.done).length + ':' + JSON.stringify(p.prices);
    for (const b of sel) if (b.k === 'b') s += ':' + b.queue.map(q => q.unit || q.tech).join(',');
    return s;
  };
  UI.renderCard = function () {
    const card = UI.card;
    for (let i = 0; i < 15; i++) {
      const b = UI.cells[i], c = card[i];
      if (!c) { b.className = 'cb empty'; b.querySelector('img').removeAttribute('src'); b.querySelector('.hk').textContent = ''; b.querySelector('.q').textContent = ''; continue; }
      b.className = 'cb' + (c.block ? ' off' : c.poor ? ' poor' : '') + (c.on ? ' on' : '') + (UI.focus === i ? ' focus' : '');
      const img = b.querySelector('img'); if (img.getAttribute('src') !== c.icon) img.src = c.icon;
      c.hk = HK[i]; b.querySelector('.hk').textContent = HK[i]; b.querySelector('.q').textContent = c.count ? c.count : '';
    }
  };
  UI.renderCardCounts = function () { if (UI.focus !== UI._lf) { UI._lf = UI.focus; UI.renderCard(); } };
  /* ------------------------------------------------------------ selection panel */
  UI.updateSel = function () {
    const A = UI.A, G = A.G, me = A.me; const sp = $('#selp');
    const sel = A.sel.map(id => G.get(id)).filter(e => e && !e.dead);
    if (sel.length !== A.sel.length) A.sel = sel.map(e => e.id);
    if (!sel.length) { const k = 'none'; if (UI._sk !== k) { UI._sk = k; sp.innerHTML = `<div class="sinfo"><div class="sname">${G.players[me].name}</div><div class="ssub">${A.touchUI ? 'Tap a unit to select it. Drag to box-select. Two fingers pan and pinch to zoom.' : 'Click to select · drag a box · right-click to command · <kbd>Space</kbd> idle villager · <kbd>Enter</kbd> army'}</div><div class="ssub" id="sc_line"></div></div>`; } const sl = $('#sc_line'); if (sl) sl.textContent = 'Score ' + G.score(G.players[me]) + ' · ' + D.AGES[G.players[me].age].name; return; }
    if (sel.length === 1) {
      const e = sel[0]; const key = 'one' + e.id; let html = '';
      if (UI._sk !== key) { UI._sk = key; sp.innerHTML = `<div class="portrait"><img></div><div class="sinfo"><div class="sname"></div><div class="ssub"></div><div class="hpbar"><i></i></div><div class="stats"></div><div class="queue"></div></div>`; }
      const img = sp.querySelector('.portrait img');
      const icon = e.k === 'u' ? (e.type === 'deer' ? IC.res('carcass') : IC.unit(e.type)) : e.k === 'b' ? IC.bld(e.type) : IC.res(e.type);
      if (img.getAttribute('src') !== icon) img.src = icon;
      let name = '', sub = '', hp = 1, stats = '', q = '';
      const owner = e.owner >= 0 ? G.players[e.owner] : null;
      if (e.k === 'u') {
        const s = G.ustat(e.owner, e.type); name = s.name || D.UNITS[e.type].name; hp = e.hp / s.hp;
        sub = (owner ? `<span style="color:${S.playerCol(e.owner).l}">${owner.name}</span> · ` : '') + Math.ceil(e.hp) + '/' + s.hp + ' HP';
        if (e.type !== 'deer') stats = `<span><img src="${IC.get('sword', 24)}">${s.atk}</span><span><img src="${IC.get('shield', 24)}">${s.am}</span><span><img src="${IC.get('pshield', 24)}">${s.ap}</span>` + (s.ranged ? `<span><img src="${IC.get('bow', 24)}">${s.range.toFixed(1).replace('.0', '')}</span>` : '') + `<span><img src="${IC.get('eye', 24)}">${s.los}</span>`;
        if (e.type === 'villager' && e.owner === me) { const task = { gather: 'Gathering', return: 'Carrying to drop-off', build: 'Building', idle: 'Idle', move: 'Walking', attack: 'Fighting', flee: 'Fleeing' }[e.st] || e.st; q = `<span class="ssub">${task}${e.carry > 0.5 ? ` · ${Math.floor(e.carry)} ${D.RESNAME[e.ct] || ''}` : ''}</span>`; }
      } else if (e.k === 'b') {
        const bs = G.bstat(e.owner, e.type), d = D.BUILD[e.type]; name = d.name; hp = e.hp / bs.hp;
        sub = (owner ? `<span style="color:${S.playerCol(e.owner).l}">${owner.name}</span> · ` : '') + Math.ceil(e.hp) + '/' + bs.hp + ' HP';
        stats = `<span><img src="${IC.get('shield', 24)}">${bs.am}</span><span><img src="${IC.get('pshield', 24)}">${bs.ap}</span>` + (bs.atk ? `<span><img src="${IC.get('arrow', 24)}">${bs.atk.dmg}</span><span><img src="${IC.get('bow', 24)}">${bs.atk.range}</span>` : '') + (d.pop ? `<span><img src="${IC.get('pop', 24)}">+${d.pop}</span>` : '');
        if (!e.done) q = `<div class="qbar" style="max-width:200px"><i style="width:${(e.prog * 100).toFixed(0)}%"></i></div><span class="ssub">${(e.prog * 100).toFixed(0)}% built · ${e.lastBuilders || 0} builder${e.lastBuilders === 1 ? '' : 's'}</span>`;
        else if (e.type === 'farm') q = `<span class="ssub">${Math.floor(e.food)} food left${e.farmer ? '' : ' · no farmer'}</span>`;
        else if (e.queue.length && e.owner === me) { q = e.queue.map((x, i) => `<div class="mini" data-b="${e.id}" data-q="${i}" title="Cancel"><img src="${x.unit ? IC.unit(x.unit) : IC.get(D.TECH[x.tech].ageUp ? 'age' : D.TECH[x.tech].icon || 'up', 48)}"></div>`).slice(0, 8).join('') + `<div class="qbar"><i style="width:${(e.queue[0].t / e.queue[0].T * 100).toFixed(0)}%"></i></div>`; }
        else if (d.trains && e.owner === me) q = `<span class="ssub">${e.rally ? 'Rally point set' : 'Right-click to set a rally point'}</span>`;
      } else { name = { tree: 'Tree', berry: 'Berry Bush', gold: 'Gold Mine', stone: 'Stone Mine', carcass: 'Deer Carcass', fish: 'Fish' }[e.type] || e.type; sub = Math.ceil(e.amt) + ' ' + D.RESNAME[D.RESOF[e.type]]; hp = -1; }
      const nm = sp.querySelector('.sname'); if (nm.textContent !== name) nm.textContent = name;
      sp.querySelector('.ssub').innerHTML = sub;
      const hb = sp.querySelector('.hpbar'); hb.style.display = hp < 0 ? 'none' : ''; if (hp >= 0) { hb.firstChild.style.width = (Math.max(0, hp) * 100).toFixed(0) + '%'; hb.firstChild.style.background = hp < 0.35 ? 'linear-gradient(180deg,#ff8a6a,#c0392b)' : hp < 0.7 ? 'linear-gradient(180deg,#ffe07a,#d39a2a)' : ''; }
      const st = sp.querySelector('.stats'); if (st._h !== stats) { st._h = stats; st.innerHTML = stats; }
      const qq = sp.querySelector('.queue'); const qk = q.replace(/width:\d+%/g, ''); if (qq._k !== qk) { qq._k = qk; qq.innerHTML = q; } else { const bars = qq.querySelectorAll('.qbar i'); const m = q.match(/width:(\d+)%/); if (bars[0] && m) bars[0].style.width = m[1] + '%'; }
      return;
    }
    // many
    const key = 'many' + sel.map(e => e.id).join(',');
    const byType = {}; for (const e of sel) (byType[e.type] = byType[e.type] || []).push(e);
    const grouped = sel.length > 18;
    if (UI._sk !== key) {
      UI._sk = key;
      let h = `<div class="sinfo"><div class="sname">${sel.length} selected</div><div class="grid">`;
      if (grouped) for (const t in byType) h += `<div class="mini" data-id="${byType[t][0].id}" data-type="${t}"><img src="${sel[0].k === 'b' ? IC.bld(t) : IC.unit(t)}"><b>${byType[t].length}</b><i></i></div>`;
      else for (const e of sel) h += `<div class="mini" data-id="${e.id}"><img src="${e.k === 'b' ? IC.bld(e.type) : IC.unit(e.type)}"><i></i></div>`;
      sp.innerHTML = h + '</div></div>';
    }
    const minis = sp.querySelectorAll('.mini i');
    if (!grouped) sel.forEach((e, i) => { const mx = e.k === 'u' ? G.ustat(e.owner, e.type).hp : G.bstat(e.owner, e.type).hp; if (minis[i]) { const f = Math.max(0, e.hp / mx); minis[i].style.width = 'calc(' + (f * 100).toFixed(0) + '% - 6px)'; minis[i].style.background = f < 0.35 ? '#d9443a' : f < 0.7 ? '#e0b23a' : '#57c24a'; } });
  };
  /* ------------------------------------------------------------ alerts / banner / goals */
  UI.alert = function (msg, cls) {
    const al = $('#alerts'); if (!al) return;
    const last = UI.alerts[UI.alerts.length - 1]; if (last && last.msg === msg && performance.now() - last.t < 2500) return;
    const e = el('div', 'alert ' + (cls || ''), msg); al.appendChild(e); UI.alerts.push({ e, t: performance.now(), msg });
    while (UI.alerts.filter(a => !a.gone).length > 4) { const a = UI.alerts.find(a => !a.gone); a.gone = true; a.e.remove(); }
  };
  UI.banner = function (text, sub, ms) { const b = $('#banner'); if (!b) return; b.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); b.classList.add('show'); clearTimeout(UI._bt); UI._bt = setTimeout(() => b.classList.remove('show'), ms || 3200); };
  UI.goals = function (sc, S) {
    const g = $('#goals'); if (!sc) { g.classList.add('hidden'); return; }
    g.classList.remove('hidden');
    const cur = S.goal || 0;
    const h = `<h4><span>${sc.name}</span><span style="font:600 11px var(--sans);color:#bfa77c">${cur}/${sc.goals.length} ▾</span></h4>` + sc.goals.map((q, i) => `<div class="g ${i < cur ? 'done' : i === cur ? 'cur' : ''}">${q.text}</div>`).join('');
    if (g._h !== h) { g._h = h; g.innerHTML = h; }
  };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
