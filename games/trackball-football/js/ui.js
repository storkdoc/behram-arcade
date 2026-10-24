/* ==========================================================================
   TRACKBALL FOOTBALL — ui.js
   Every piece of text, HUD and menu is drawn straight onto the device-
   resolution canvas (no CSS scaling, no bitmap fonts), so it is pin sharp on
   Retina screens. Buttons register hit boxes in CSS px for taps / clicks and
   a focus order for keyboard / gamepad.
   ========================================================================== */
const UI = (() => {
  let hits = [], prevHits = [], focus = 0;
  const f = (w, s, fam) => `${w} ${s}px ${fam || FONT}`;
  function beginFrame() { prevHits = hits; hits = []; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); } }
  function text(ctx, s, x, y, font, col, align, base) { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align || 'center'; ctx.textBaseline = base || 'middle'; ctx.fillText(s, x, y); }
  function fit(ctx, s, maxW, w, size, fam) { let z = size; ctx.font = f(w, z, fam); while (z > 7 && ctx.measureText(s).width > maxW) { z -= 1; ctx.font = f(w, z, fam); } return z; }
  /** a button; returns true while focused */
  function button(ctx, label, x, y, w, h, fn, o = {}) {
    const idx = hits.filter(h => h.focusable).length, foc = o.focusable !== false && idx === focus && UI.kbd;
    hits.push({ x, y, w, h, label, fn, focusable: o.focusable !== false, lr: o.lr });
    const hot = o.hot || foc;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, hot ? '#ffe27a' : o.bg || 'rgba(40,48,78,0.92)'); g.addColorStop(1, hot ? '#e3a51a' : o.bg2 || 'rgba(18,22,40,0.92)');
    ctx.fillStyle = g; rr(ctx, x, y, w, h, Math.min(12, h / 3)); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = hot ? '#fff3c4' : 'rgba(150,170,255,0.35)'; ctx.stroke();
    const z = fit(ctx, label, w - 16, 800, o.size || Math.min(20, h * 0.42), o.fam);
    text(ctx, label, x + w / 2, y + h / 2 + 1, f(800, z, o.fam), hot ? '#1b1000' : o.col || '#f2f4ff');
    return foc;
  }
  function handleKeys(typed) { // focus nav for menus; returns true if consumed
    const fl = prevHits.filter(h => h.focusable); if (!fl.length) return;
    for (const e of typed) {
      if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Tab') { UI.kbd = true; focus = (focus + 1) % fl.length; Sound.play('move'); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { UI.kbd = true; focus = (focus - 1 + fl.length) % fl.length; Sound.play('move'); }
      else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') && fl[focus] && fl[focus].lr) { UI.kbd = true; fl[focus].lr(e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1); Sound.play('move'); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { if (UI.kbd && fl[focus]) { Sound.play('select'); fl[focus].fn(); return true; } else { UI.kbd = true; } }
    }
  }
  function tap(x, y) {
    for (let i = prevHits.length - 1; i >= 0; i--) { const h = prevHits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { UI.kbd = false; Sound.play('select'); h.fn(x, y); return true; } }
    return false;
  }
  function resetFocus() { focus = 0; }

  /* ---------------- logo ---------------- */
  function logo(ctx, cx, cy, s) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `italic 900 ${s}px ${DFONT}`;
    const g = ctx.createLinearGradient(0, cy - s, 0, cy + s * 0.1);
    g.addColorStop(0, '#fff8d8'); g.addColorStop(0.45, '#ffd23c'); g.addColorStop(0.55, '#d98a12'); g.addColorStop(1, '#ffe27a');
    ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.14; ctx.strokeStyle = '#2a0a02'; ctx.strokeText('TRACKBALL', cx, cy - s * 0.02);
    ctx.shadowColor = 'rgba(255,170,40,0.55)'; ctx.shadowBlur = s * 0.35; ctx.fillStyle = g; ctx.fillText('TRACKBALL', cx, cy - s * 0.02); ctx.shadowBlur = 0;
    ctx.font = `italic 900 ${s * 0.82}px ${DFONT}`;
    const g2 = ctx.createLinearGradient(0, cy, 0, cy + s * 0.85); g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, '#ff4a5a');
    ctx.lineWidth = s * 0.12; ctx.strokeText('FOOTBALL', cx, cy + s * 0.78); ctx.fillStyle = g2; ctx.fillText('FOOTBALL', cx, cy + s * 0.78);
    ctx.restore();
  }

  /* ---------------- HUD ---------------- */
  function ballOn(S) { const x = S.los; if (Math.abs(x - 60) < 0.5) return 'MIDFIELD'; return (x < 60 ? TEAM[0].short : TEAM[1].short) + ' ' + Math.round(x < 60 ? x - 10 : 110 - x); }
  const ORD = ['', '1ST', '2ND', '3RD', '4TH'];
  function clockStr(c) { c = Math.max(0, c); const m = Math.floor(c / 60), s = Math.floor(c % 60); return m + ':' + String(s).padStart(2, '0'); }
  function hud(ctx, S, L, me) {
    const sm = L.small, h = sm ? 26 : 34, y = L.safe.t + (sm ? 5 : 10), fs = sm ? 13 : 17;
    const segs = [];
    ctx.font = f(800, fs, DFONT);
    const down = S.ph === 'over' ? 'FINAL' : S.ph === 'half' ? 'HALFTIME' : (ORD[S.dn] || '4TH') + ' & ' + (S.gtg ? 'GOAL' : Math.max(1, Math.round(S.tg)));
    const items = [
      { t: 0, nw: ctx.measureText(TEAM[0].name).width },
      { t: 1, nw: ctx.measureText(TEAM[1].name).width },
      { k: 'clk', s: (S.half === 1 ? '1ST' : '2ND') + '  ' + clockStr(S.clk) },
      { k: 'dn', s: down + (S.ph === 'over' || S.ph === 'half' ? '' : '  ·  ' + ballOn(S)) },
    ];
    const bg = sm ? 22 : 28, box = sm ? 30 : 38;
    for (const it of items) { if (it.s) it.w = ctx.measureText(it.s).width + (sm ? 18 : 26); else it.w = h * 0.95 + it.nw + bg + box + 4; }
    let tw = items.reduce((a, b) => a + b.w, 0);
    const maxW = L.W - L.safe.l - L.safe.r - (L.portrait ? 12 : sm ? 196 : 220);
    if (tw > maxW) { items[3].hide = true; tw -= items[3].w; }
    if (tw > maxW) { items[2].hide = true; tw -= items[2].w; }
    let x = Math.round(L.W / 2 - tw / 2);
    ctx.fillStyle = 'rgba(6,8,16,0.86)'; rr(ctx, x - 3, y - 3, tw + 6, h + 6, 9); ctx.fill();
    for (const it of items) {
      if (it.hide) continue;
      if (it.t != null) {
        const T = TEAM[it.t], g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, it.t ? '#2a56c8' : '#d21d3a'); g.addColorStop(1, it.t ? '#122a6e' : '#7a0a1c');
        ctx.fillStyle = g; rr(ctx, x, y, it.w - 2, h, 6); ctx.fill();
        text(ctx, T.sym, x + h * 0.5, y + h / 2 + 1, f(900, fs * 1.05, FONT), it.t ? '#ffcc33' : '#fff');
        text(ctx, T.name, x + h * 0.95, y + h / 2 + 1, f(800, fs, DFONT), '#fff', 'left');
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, x + it.w - (sm ? 30 : 38), y + 3, sm ? 26 : 33, h - 6, 5); ctx.fill();
        text(ctx, String(S.sc[it.t]), x + it.w - (sm ? 17 : 21.5), y + h / 2 + 1, f(900, fs * 1.1, FONT), '#fff');
        if (S.off === it.t && S.ph !== 'over') { Render.drawBallAt(ctx, x + h * 0.95 + it.nw + bg / 2 + 1, y + h / 2, sm ? 30 : 36, 0, 0); }
      } else {
        text(ctx, it.s, x + it.w / 2, y + h / 2 + 1, f(800, fs, DFONT), it.k === 'clk' && S.clk < 20 && S.ph === 'live' ? '#ff6a6a' : '#e9ecff');
      }
      x += it.w;
    }
    L.hudBottom = y + h + 4;
    const extra = [items[2], items[3]].filter(i => i.hide).map(i => i.s).join('   ·   ');
    if (extra) {
      ctx.font = f(800, fs * 0.9, DFONT); const ew = ctx.measureText(extra).width + 24, ey = y + h + 6;
      ctx.fillStyle = 'rgba(6,8,16,0.82)'; rr(ctx, L.W / 2 - ew / 2, ey, ew, h * 0.8, 7); ctx.fill();
      text(ctx, extra, L.W / 2, ey + h * 0.4 + 1, f(800, fs * 0.9, DFONT), '#e9ecff');
      L.hudBottom = ey + h * 0.8 + 4;
    }
  }
  let bnId = -1, bnT = 0;
  function bannerDraw(ctx, S, L, dt) {
    if (!S.bn) { bnId = -1; return; }
    if (S.bn[3] !== bnId) { bnId = S.bn[3]; bnT = 0; }
    bnT += dt;
    const big = S.bn[0] === 'TOUCHDOWN!' || S.bn[0] === 'FINAL' || S.bn[0] === 'FIELD GOAL IS GOOD!' || S.bn[0] === 'HALFTIME';
    const sz = Math.min(L.small ? 30 : 54, L.W / (S.bn[0].length * 0.62)) * (big ? 1.25 : 1);
    const cy = L.field.y + L.field.h * (big ? 0.42 : 0.7), k = Math.min(1, bnT / 0.22), e = 1 - Math.pow(1 - k, 3);
    const w = Math.min(L.W - 20, sz * S.bn[0].length * 0.62 + 80), x = L.W / 2 - w / 2 + (1 - e) * -L.W * 0.4;
    ctx.save(); ctx.globalAlpha = e;
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(8,10,24,0)'); g.addColorStop(0.12, 'rgba(8,10,24,0.85)'); g.addColorStop(0.88, 'rgba(8,10,24,0.85)'); g.addColorStop(1, 'rgba(8,10,24,0)');
    const bh = sz * (S.bn[1] ? 1.75 : 1.3);
    ctx.fillStyle = g; ctx.fillRect(x, cy - bh / 2, w, bh);
    ctx.fillStyle = S.bn[2]; ctx.fillRect(x + w * 0.12, cy - bh / 2, w * 0.76, 2); ctx.fillRect(x + w * 0.12, cy + bh / 2 - 2, w * 0.76, 2);
    ctx.font = f('italic 900', sz, DFONT); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = sz * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineJoin = 'round';
    const ty = cy - (S.bn[1] ? sz * 0.28 : 0);
    ctx.strokeText(S.bn[0], L.W / 2 + (1 - e) * -L.W * 0.4, ty); ctx.fillStyle = S.bn[2]; ctx.fillText(S.bn[0], L.W / 2 + (1 - e) * -L.W * 0.4, ty);
    if (S.bn[1]) text(ctx, S.bn[1], L.W / 2 + (1 - e) * -L.W * 0.4, cy + sz * 0.52, f(700, Math.max(12, sz * 0.36), DFONT), '#e8ecff');
    ctx.restore();
  }
  function callsDraw(ctx, S, L) {
    if (!S.calls || S.ph !== 'live' || S.t > 2.2) return;
    const a = Math.min(1, (2.2 - S.t) * 2), y = (L.hudBottom || 50) + 8, sm = L.small;
    ctx.save(); ctx.globalAlpha = a;
    const offT = S.off, s1 = TEAM[offT].name + ' · ' + S.calls[0], s2 = TEAM[1 - offT].name + ' · ' + S.calls[1], fs = sm ? 12 : 14;
    ctx.font = f(800, fs, DFONT); const w1 = ctx.measureText(s1).width + 22, w2 = ctx.measureText(s2).width + 22, vs = 30;
    let x = L.W / 2 - (w1 + w2 + vs) / 2;
    for (const [s, w, t] of [[s1, w1, offT], [null, vs], [s2, w2, 1 - offT]]) {
      if (s) { ctx.fillStyle = t ? 'rgba(30,70,190,0.9)' : 'rgba(180,20,45,0.9)'; rr(ctx, x, y, w, fs + 12, 6); ctx.fill(); text(ctx, s, x + w / 2, y + (fs + 12) / 2 + 1, f(800, fs, DFONT), '#fff'); }
      else text(ctx, 'VS', x + w / 2, y + (fs + 12) / 2 + 1, f(900, fs, DFONT), '#ffd23c');
      x += w;
    }
    ctx.restore();
  }
  function wrapMeter(ctx, S, me) {
    if (!S.w || S.ph !== 'live') return;
    const c = S.pl[S.w[0]], mine = (S.w[0] < 7 ? 0 : 1) === me, p = Render.proj(c[0], c[1], 3.1), m = S.w[1];
    const w = 90, h = 9, x = p[0] - w / 2, y = p[1] - 26;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; rr(ctx, x - 3, y - 3, w + 6, h + 6, 6); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#7cff7a'); g.addColorStop(0.5, '#ffd23c'); g.addColorStop(1, '#ff3b3b');
    ctx.fillStyle = g; rr(ctx, x, y, Math.max(2, w * Math.min(1, m)), h, 4); ctx.fill();
    const blink = Math.sin(performance.now() / 70) > 0;
    text(ctx, mine ? 'SPIN TO BREAK FREE!' : 'SPIN TO DRIVE HIM DOWN!', p[0], y - 12, f('italic 900', 15, DFONT), blink ? '#fff' : '#ffd23c');
  }

  /* ---------------- play diagrams ---------------- */
  function diagram(ctx, play, x, y, w, h, offense, mirror, mySym, theirSym, myCol, theirCol) {
    // chalkboard
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#173d22'); g.addColorStop(1, '#0d2715');
    ctx.fillStyle = g; rr(ctx, x, y, w, h, 6); ctx.fill();
    const F0 = -10, F1 = 32, L0 = -16, L1 = 16;
    const X = fv => mirror ? x + w - (fv - F0) / (F1 - F0) * w : x + (fv - F0) / (F1 - F0) * w, Y = lv => y + (lv - L0) / (L1 - L0) * h;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    for (let fv = 0; fv <= 30; fv += 10) { ctx.beginPath(); ctx.moveTo(X(fv), y + 3); ctx.lineTo(X(fv), y + h - 3); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(80,150,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(0), y + 3); ctx.lineTo(X(0), y + h - 3); ctx.stroke();
    const sym = (s, px, py, col, r) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.4, r * 0.38); ctx.beginPath(); if (s === 'X') { ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r); ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r); } else { ctx.arc(px, py, r, 0, 7); } ctx.stroke(); };
    const arrow = (pts, col, dash, wd) => {
      ctx.strokeStyle = col; ctx.lineWidth = wd || 1.6; ctx.setLineDash(dash ? [3, 3] : []);
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.setLineDash([]);
      const a = pts[pts.length - 1], b = pts[pts.length - 2] || a, an = Math.atan2(a[1] - b[1], a[0] - b[0]), s = 5;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0] + Math.cos(an) * 2, a[1] + Math.sin(an) * 2); ctx.lineTo(a[0] - Math.cos(an - 0.5) * s, a[1] - Math.sin(an - 0.5) * s); ctx.lineTo(a[0] - Math.cos(an + 0.5) * s, a[1] - Math.sin(an + 0.5) * s); ctx.closePath(); ctx.fill();
    };
    const r = Math.max(2.5, Math.min(w, h) * 0.035);
    const offSym = offense ? mySym : theirSym, defSym = offense ? theirSym : mySym;
    const offCol = offense ? myCol : 'rgba(255,255,255,0.45)', defCol = offense ? 'rgba(255,255,255,0.45)' : myCol;
    if (play.kind === 'punt' || play.kind === 'fg') {
      OFF_FORM.forEach(p => sym(offSym, X(p[0]), Y(p[1] * 0.5), offCol, r));
      const k = OFF_FORM[3]; const tx = play.kind === 'punt' ? 30 : 31;
      ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(k[0] - 3), Y(0)); ctx.quadraticCurveTo(X(12), Y(0) - h * 0.9, X(tx), Y(play.kind === 'fg' ? 0 : 3)); ctx.stroke(); ctx.setLineDash([]);
      if (play.kind === 'fg') { ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(31), Y(-4)); ctx.lineTo(X(31), Y(4)); ctx.stroke(); }
      return;
    }
    if (offense) {
      DEF_FORM.forEach(p => sym(defSym, X(p[0]), Y(p[1]), defCol, r * 0.85));
      OFF_FORM.forEach((p, i) => {
        const rt = play.r && play.r[i];
        if (i === 3 && play.qb) arrow([[X(p[0]), Y(p[1])], ...play.qb.map(q => [X(q[0]), Y(q[1])])], 'rgba(255,255,255,0.6)', true, 1.2);
        if (Array.isArray(rt)) arrow([[X(p[0]), Y(p[1])], ...rt.map(q => [X(q[0]), Y(q[1])])], i === 4 && play.kind === 'run' ? '#ffd23c' : '#ffffff', false, i === 4 && play.kind === 'run' ? 2.4 : 1.6);
        else if (i <= 2 || rt === 'blk' || rt === 'pull') { const px = X(p[0] + 1.5), py = Y(p[1]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X(p[0]), py); ctx.lineTo(px, py); ctx.moveTo(px, py - 3); ctx.lineTo(px, py + 3); ctx.stroke(); }
        sym(offSym, X(p[0]), Y(p[1]), offCol, r);
      });
    } else {
      OFF_FORM.forEach(p => sym(offSym, X(p[0]), Y(p[1]), offCol, r * 0.85));
      DEF_FORM.forEach((p, i) => {
        const a = play.a[i], px = X(p[0]), py = Y(p[1]);
        if (a[0] === 'rush') arrow([[px, py], [X(-4.2), Y(p[1] * 0.3)]], '#ff6a6a', false, 1.8);
        else if (a[0] === 'fill') arrow([[px, py], [X(0.5), Y(p[1] * 0.5 + (i === 6 ? 3 : -1))]], '#ffb04a', false, 1.8);
        else if (a[0] === 'man') { const t = OFF_FORM[a[1]]; arrow([[px, py], [X(t[0] + 4), Y(t[1])]], '#ffffff', true, 1.3); }
        else if (a[0] === 'zone') { const zx = X(Math.min(a[1], 30)), zy = Y(a[2]); ctx.fillStyle = 'rgba(120,200,255,0.22)'; ctx.beginPath(); ctx.ellipse(zx, zy, w * 0.11, h * 0.15, 0, 0, 7); ctx.fill(); arrow([[px, py], [zx, zy]], 'rgba(160,220,255,0.9)', false, 1.3); }
        sym(defSym, px, py, defCol, r);
      });
    }
  }

  /* ---------------- play select overlay ---------------- */
  function selectPanel(ctx, S, L, Sel, me, opts) {
    const offense = S.off === me, list = Sel.list, n = list.length;
    const portrait = L.portrait, sm = L.small;
    const rl = L.selBox ? L.selBox.l : L.safe.l + 8, rr2 = L.selBox ? L.selBox.r : L.W - L.safe.r - 8;
    const pw = Math.min(rr2 - rl, portrait ? 520 : 940), cols = portrait ? 2 : Math.min(4, Math.ceil(n / 2)), rows = Math.ceil(n / cols);
    const top = (L.hudBottom || 40) + 4, bottomLimit = portrait ? L.field.y + L.field.h : L.H - L.safe.b - 6;
    const headH = sm ? 40 : 56, footH = sm ? 26 : 34, gap = sm ? 6 : 10;
    let cw = (pw - gap * (cols + 1)) / cols, ch = cw * 0.66 + (sm ? 18 : 26);
    const avail = bottomLimit - top - headH - footH - gap * (rows + 1);
    if (ch * rows > avail) { ch = avail / rows; cw = Math.min(cw, (ch - (sm ? 18 : 26)) / 0.66); }
    const ph = headH + footH + gap * (rows + 1) + ch * rows, pw2 = cw * cols + gap * (cols + 1);
    const px = (rl + rr2) / 2 - pw2 / 2, py = top;
    ctx.fillStyle = 'rgba(4,6,14,0.86)'; rr(ctx, px, py, pw2, ph, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,60,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    const T = TEAM[me];
    const title = offense ? 'OFFENSE · CALL YOUR PLAY' : 'DEFENSE · CALL YOUR COVERAGE';
    const tfs = fit(ctx, title, pw2 - 16 - 56, 'italic 900', sm ? 15 : 21, DFONT); text(ctx, title, px + 16, py + headH * 0.36, f('italic 900', tfs, DFONT), offense ? '#ffd23c' : '#7fc4ff', 'left');
    const sit = (ORD[S.dn] || '') + ' & ' + (S.gtg ? 'GOAL' : Math.max(1, Math.round(S.tg))) + ' · ' + ballOn(S);
    text(ctx, T.name + ' · ' + sit, px + 16, py + headH * 0.76, f(700, sm ? 11 : 14, DFONT), '#c9d0ee', 'left');
    // timer + opponent status
    const tl = Math.max(0, S.selT);
    text(ctx, String(tl), px + pw2 - 22, py + headH * 0.42, f(900, sm ? 20 : 28, FONT), tl <= 3 ? '#ff6a6a' : '#fff');
    const oppLocked = S.lk[1 - me], cpu = !S.hum[1 - me];
    const os = cpu ? 'CPU HAS CALLED ITS PLAY' : oppLocked ? 'OPPONENT LOCKED IN' : 'OPPONENT IS CHOOSING\u2026';
    ctx.font = f('italic 900', tfs, DFONT); const titleW = ctx.measureText(title).width; ctx.font = f(800, sm ? 10 : 13, DFONT); const osW = ctx.measureText(os).width;
    if (px + 16 + titleW + 14 + osW < px + pw2 - 50) text(ctx, os, px + pw2 - 50, py + headH * 0.42, f(800, sm ? 10 : 13, DFONT), oppLocked || cpu ? '#7cff7a' : '#ffb04a', 'right');
    else { ctx.font = f(700, sm ? 11 : 14, DFONT); const subW = ctx.measureText(T.name + ' · ' + sit).width; ctx.font = f(800, sm ? 9 : 12, DFONT);
      const os2 = px + 16 + subW + 10 + ctx.measureText(os).width > px + pw2 - 16 ? (cpu ? 'CPU READY' : oppLocked ? 'OPP. LOCKED' : 'OPP. CHOOSING\u2026') : os;
      text(ctx, os2, px + pw2 - 16, py + headH * 0.80, f(800, sm ? 9 : 12, DFONT), oppLocked || cpu ? '#7cff7a' : '#ffb04a', 'right'); }
    // cards
    for (let k = 0; k < n; k++) {
      const c = k % cols, r = Math.floor(k / cols), x = px + gap + c * (cw + gap), y = py + headH + gap + r * (ch + gap);
      const pl = list[k], sel = k === Sel.idx, locked = Sel.locked && sel;
      ctx.fillStyle = sel ? 'rgba(255,210,60,0.18)' : 'rgba(255,255,255,0.05)'; rr(ctx, x, y, cw, ch, 8); ctx.fill();
      if (sel) { ctx.strokeStyle = locked ? '#7cff7a' : '#ffd23c'; ctx.lineWidth = 2.5; ctx.stroke(); }
      const dh = ch - (sm ? 18 : 26);
      diagram(ctx, pl, x + 4, y + 4, cw - 8, dh - 6, offense, me === 1, T.sym, TEAM[1 - me].sym, me ? '#ffcc33' : '#ff5a6e', null);
      const z = fit(ctx, pl.name, cw - 10, 800, sm ? 11 : 15, DFONT);
      text(ctx, pl.name, x + cw / 2, y + dh + (sm ? 6 : 9), f(800, z, DFONT), sel ? '#ffe27a' : '#eef');
      if (locked) { ctx.save(); ctx.translate(x + cw / 2, y + dh / 2); ctx.rotate(-0.15); text(ctx, 'LOCKED IN', 0, 0, f('italic 900', sm ? 14 : 22, DFONT), '#7cff7a'); ctx.restore(); }
      hits.push({ x, y, w: cw, h: ch, label: 'PLAY:' + pl.id, fn: () => { if (!App.paused) opts.onCard(k); }, focusable: false });
    }
    // footer
    const fy = py + ph - footH / 2;
    if (Sel.locked) text(ctx, cpu || oppLocked ? 'HERE WE GO\u2026' : 'LOCKED IN · WAITING FOR YOUR OPPONENT\u2026', px + pw2 / 2, fy, f(800, sm ? 11 : 14, DFONT), '#7cff7a');
    else text(ctx, opts.hint, px + pw2 / 2, fy, f(700, fit(ctx, opts.hint, pw2 - 20, 700, sm ? 10 : 13, DFONT), DFONT), '#aab3d8');
  }

  return { beginFrame, button, handleKeys, tap, text, rr, f, fit, logo, hud, bannerDraw, callsDraw, wrapMeter, selectPanel, diagram, resetFocus, clockStr, get hits() { return prevHits; }, get liveHits() { return hits; }, kbd: false };
})();
