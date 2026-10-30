/* ==========================================================================
   TRACKBALL FOOTBALL — helmet.js : HELMET CAM
   An optional second viewport: the game seen through the facemask of the man
   you control (the ball carrier on offense, your selected defender on defense),
   next to the broadcast view, which stays fully playable.
   The intent cues are read from the AI's own state, published by the sim in
   every snapshot (S.it = what each AI player is doing this step and where to,
   S.rt = routes still to run, S.ky = what the defense has keyed on), so nothing
   is invented: a pursuit line ends where that defender is really heading, and
   the flashing "!" only appears while a tackler is inside his real dive window.
   Only players inside the helmet's field of view get cues (plus an edge
   warning for an unseen pursuer closing from behind: glance over your shoulder).
   V / gamepad Y / the HELMET CAM button toggle it; the choice is saved.
   ========================================================================== */
const Helmet = (() => {
  const LS = 'tbf.helmet', LS_SHAKE = 'tbf.helmshake';
  let store = null; try { store = typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { store = null; }
  const getLS = k => { try { return store ? store.getItem(k) : null; } catch (_) { return null; } };
  const setLS = (k, v) => { try { if (store) store.setItem(k, v); } catch (_) { /* private mode */ } };
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { on: getLS(LS) === '1', shake: (getLS(LS_SHAKE) ?? (reduceMotion ? '0' : '1')) === '1', k: 0, toast: null };
  const HFOV = 74 * Math.PI / 180;

  /* ---------------- what each AI intent means ---------------- */
  // threat: a defender closing on the ball carrier (lines + rings in red/orange)
  const KIND = {
    dive: { t: '!', c: '#ff2d2d', threat: 1 }, close: { t: 'TACKLE', c: '#ff4a3a', threat: 1 }, pursue: { t: 'PURSUING', c: '#ff8a2a', threat: 1 },
    cutoff: { t: 'CUTOFF', c: '#ff8a2a', threat: 1 }, edge: { t: 'CONTAIN EDGE', c: '#ffd23c', threat: 1 }, deep: { t: 'DEEP SAFETY', c: '#c08cff', threat: 1 },
    rush: { t: 'BLITZ', c: '#ff3d6a', threat: 1 }, contain: { t: 'CONTAIN EDGE', c: '#ffd23c', threat: 1 }, read: { t: 'READING', c: '#9fd0ff' },
    spy: { t: 'QB SPY', c: '#c08cff', threat: 1 }, fill: { t: 'FILL', c: '#ff8a2a', threat: 1 }, man: { t: 'MAN', c: '#5fd0ff' }, zone: { t: 'ZONE', c: '#6ea8ff' },
    ball: { t: 'BALL HAWK', c: '#7cff7a' }, cover: { t: 'COVER', c: '#5fd0ff' }, engaged: { t: 'ENGAGED', c: '#a8adb8' },
    block: { t: 'BLOCK', c: '#7cff7a' }, lead: { t: 'LEAD BLOCK', c: '#7cff7a' }, route: { t: 'ROUTE', c: '#8fe8ff' }, catch: { t: 'BALL!', c: '#8fe8ff' },
    run: { t: 'RUNNING', c: '#ffd23c' }, qb: { t: 'QB', c: '#ffffff' }, scram: { t: 'SCRAMBLE', c: '#ffd23c' },
    // SELL OUT counter assignments (straight from the sim's counter call)
    eblitz: { t: 'EDGE BLITZ', c: '#ff3d6a', threat: 1 }, scrape: { t: 'SCRAPE', c: '#ff8a2a', threat: 1 }, ccrash: { t: 'CORNER CRASH', c: '#ff3d6a', threat: 1 },
    rotate: { t: 'ROTATE DOWN', c: '#ff8a2a', threat: 1 }, gap: { t: 'SHOOT GAP', c: '#ff3d6a', threat: 1 }, pinch: { t: 'PINCH', c: '#ff3d6a', threat: 1 },
    blitz: { t: 'BLITZ', c: '#ff3d6a', threat: 1 }, sniff: { t: 'SNIFF SCREEN', c: '#ff8a2a', threat: 1 }, jump: { t: 'JUMP ROUTE', c: '#ffb04a' }, bracket: { t: 'BRACKET', c: '#c9a0ff' },
  };
  const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  /** the player the helmet cam rides with (the man `me` controls), or -1 */
  function ownerOf(S, me) { if (me == null || !S || !S.ctl || !S.pl) return -1; const i = S.ctl[me]; return i != null && i >= 0 && i < S.pl.length ? i : -1; }
  /** is (x,y) inside a view from (vx,vy) looking along yaw? (with half a body of margin) */
  function inView(v, x, y) {
    const dx = x - v.x, dy = y - v.y, d = Math.hypot(dx, dy); if (d < 0.7) return false;
    return Math.abs(wrapA(Math.atan2(dy, dx) - v.yaw)) <= v.hfov / 2 + Math.atan2(0.45, d);
  }
  /** the intent cues for `me`'s helmet: straight from S.it (sim AI state). view = {x, y, yaw, hfov}
      -> { owner, vis: [{i, k, tx, ty, o, dist, mine, threat, onMe}], behind: [{i, k, dist, ang}], key } */
  function cues(S, me, view) {
    const i = ownerOf(S, me), out = { owner: i, vis: [], behind: [], key: S && S.ky || null };
    if (i < 0 || !S.it) return out;
    const myTeam = i < 7 ? 0 : 1, carrying = S.b && S.b[3] === 0 && S.b[4] === i;
    for (let j = 0; j < S.pl.length; j++) {
      if (j === i) continue;
      const q = S.pl[j], it = S.it[j], mine = (j < 7 ? 0 : 1) === myTeam, dist = Math.hypot(q[0] - view.x, q[1] - view.y);
      const k = it ? it[0] : '';
      const K = KIND[k], threat = !mine && !!(K && K.threat) && (carrying || it[3] === i);
      const onMe = !!it && it[3] === i;
      if (inView(view, q[0], q[1])) out.vis.push({ i: j, k, tx: it ? it[1] : null, ty: it ? it[2] : null, o: it ? it[3] : -1, dist, mine, threat, onMe });
      else if (!mine && (threat || (onMe && k === 'block')) && q[4] === 0 && dist < 8) {
        // unseen and coming: is he closing on me?
        const vx = Math.cos(q[2]) * q[3], vy = Math.sin(q[2]) * q[3], closing = (vx * (view.x - q[0]) + vy * (view.y - q[1])) / (dist || 1);
        if (closing > 1 || dist < 2.5) out.behind.push({ i: j, k, dist, ang: wrapA(Math.atan2(q[1] - view.y, q[0] - view.x) - view.yaw) });
      }
    }
    out.behind.sort((a, b) => a.dist - b.dist);
    return out;
  }

  /* ---------------- toggle ---------------- */
  function setOn(on, quiet) {
    st.on = !!on; setLS(LS, st.on ? '1' : '0');
    if (!quiet) { if (typeof Sound !== 'undefined') Sound.play(st.on ? 'helmOn' : 'helmOff'); st.toast = { s: st.on ? 'HELMET CAM ON' : 'HELMET CAM OFF', t0: now() }; }
  }
  const toggle = () => setOn(!st.on);
  function setShake(on) { st.shake = !!on; setLS(LS_SHAKE, st.shake ? '1' : '0'); }
  /** the Options row cycles OFF -> ON -> ON without shake -> OFF */
  function cycleOption() { if (!st.on) { setOn(true); setShake(true); } else if (st.shake) setShake(false); else { setOn(false); } }
  const optionLabel = () => 'HELMET CAM:  ' + (!st.on ? 'OFF' : st.shake ? 'ON' : 'ON · NO SHAKE');
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /* ---------------- the helmet camera ---------------- */
  const C = { i: -1, x: 60, y: 26.7, z: 1.72, yaw: 0, yv: 0, pitch: 0.075, roll: 0, bob: 0, sway: 0, ph: 0, shake: 0, sw: 0, hfov: HFOV, F: 500, cx: 0, cy: 0, t: 0, ex: 60, ey: 26.7, ez: 1.72 };
  let cyw = 1, syw = 0, cp = 1, sp = 0;
  function hfovFor(r) { const a = r.w / r.h; return a >= 1.45 ? 76 * Math.PI / 180 : a >= 1.05 ? 70 * Math.PI / 180 : 60 * Math.PI / 180; }
  function view() { return { x: C.x, y: C.y, yaw: C.yaw, hfov: C.hfov }; }
  function update(S, me, dt) {
    const i = ownerOf(S, me); if (i < 0) return false;
    const q = S.pl[i]; C.t += dt;
    let want = q[2];
    // carrying it: your eyes go downfield more than your hips do
    if (S.b[3] === 0 && S.b[4] === i && q[3] > 2 && !Render.playerInfo(S, i).qbHold) { const dn = i < 7 ? 0 : Math.PI, e = wrapA(dn - want); if (Math.abs(e) < 1.9) want += e * 0.3; }
    // a ball in the air that concerns me: look at where it's coming down
    if (S.bt && S.b[3] === 1 && S.b[5]) {
      const dx = S.bt[0] - q[0], dy = S.bt[1] - q[1], dd = Math.hypot(dx, dy);
      if (dd > 1 && (S.bt[2] === i || dd < 14)) { const a = Math.atan2(dy, dx); if (Math.abs(wrapA(a - want)) < 1.6) want = want + wrapA(a - want) * 0.65; }
    }
    const tn = now(), gap = tn - (C.last || 0) > 400; C.last = tn;
    if (gap || C.i < 0) { C.yaw = want; C.yv = 0; C.x = q[0]; C.y = q[1]; C.i = i; C.sw = 0; }
    else if (i !== C.i) { C.sw = 0.35; C.i = i; } // switched men: a quick whip-pan with a flash
    const w0 = C.sw > 0 ? 13 : 7.5, e = wrapA(want - C.yaw);
    C.yv += (e * w0 * w0 - 2 * w0 * C.yv) * dt; C.yv = Math.max(-9, Math.min(9, C.yv)); C.yaw = wrapA(C.yaw + C.yv * dt);
    const pk = Math.min(1, dt * (C.sw > 0 ? 9 : 40));
    if (Math.hypot(q[0] - C.x, q[1] - C.y) > 12) { C.x = q[0]; C.y = q[1]; } else { C.x += (q[0] - C.x) * pk; C.y += (q[1] - C.y) * pk; }
    C.sw = Math.max(0, C.sw - dt);
    const spd = q[3], amp = Math.min(1, spd / 8.5), s = q[4];
    C.ph += spd * dt * Math.PI * 2 / (1.5 + spd * 0.11);
    C.bob = Math.abs(Math.sin(C.ph)) * 0.07 * amp; C.sway = Math.sin(C.ph) * 0.03 * amp;
    const tz = s === 1 ? 0.42 : s === 2 ? 0.8 : s === 3 ? 1.6 : 1.72;
    C.z += (tz - C.z) * Math.min(1, dt * (s === 1 || s === 2 ? 7 : 4));
    const rollT = s === 1 ? 0.3 : s === 4 ? Math.sin(C.t * 10) * 0.07 : Math.max(-0.09, Math.min(0.09, -C.yv * 0.03));
    C.roll += (rollT - C.roll) * Math.min(1, dt * 6);
    const pitchT = 0.115 + amp * 0.025 + (s === 2 ? 0.26 : s === 1 ? -0.06 : 0);
    C.pitch += (pitchT - C.pitch) * Math.min(1, dt * 6);
    C.shake = Math.max(0, C.shake - dt * 2.4);
    return true;
  }
  function onEvent(e, S, me) {
    if (!st.on || !st.shake || st.k < 0.5) return;
    const i = ownerOf(S, me); if (i < 0) return;
    const q = S.pl[i], near = e.x == null ? 1 : Math.max(0, 1 - Math.hypot(e.x - q[0], e.y - q[1]) / 6);
    const v = { hit: 0.35, tackle: 0.55, bighit: 1, pad: 0.12, shed: 0.12, fumble: 0.4 }[e.n];
    if (v) C.shake = Math.max(C.shake, v * near);
  }

  /* ---------------- projection (camera at the eyes) ---------------- */
  function setup(rect, clear) { // clear: the y below which nothing (HUD) covers the view; centre the lens on the open part
    const y0 = clear && clear > rect.y && clear < rect.y + rect.h * 0.6 ? clear : rect.y, vr = { w: rect.w, h: rect.y + rect.h - y0 };
    C.hfov = hfovFor(vr); C.F = (rect.w / 2) / Math.tan(C.hfov / 2); C.cx = rect.x + rect.w / 2; C.cy = y0 + vr.h * 0.5;
    cyw = Math.cos(C.yaw); syw = Math.sin(C.yaw); cp = Math.cos(C.pitch); sp = Math.sin(C.pitch);
    C.ex = C.x + cyw * 0.12 - syw * C.sway; C.ey = C.y + syw * 0.12 + cyw * C.sway; C.ez = C.z + C.bob;
  }
  function cam3(x, y, z) { const dx = x - C.ex, dy = y - C.ey, dz = (z || 0) - C.ez, fw = dx * cyw + dy * syw; return [-dx * syw + dy * cyw, fw * sp + dz * cp, fw * cp - dz * sp]; }
  function proj(x, y, z) { const c = cam3(x, y, z), d = Math.max(0.12, c[2]); return [C.cx + C.F * c[0] / d, C.cy - C.F * c[1] / d, c[2]]; }
  const scale = (x, y) => C.F / Math.max(0.35, cam3(x, y, 1)[2]);
  const toCam = (x, y) => { const dx = C.ex - x, dy = C.ey - y, n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
  const NEAR = 0.3;
  function clipPoly(cs) {
    const out = [], n = cs.length;
    for (let k = 0; k < n; k++) {
      const a = cs[k], b = cs[(k + 1) % n], ia = a[2] >= NEAR, ib = b[2] >= NEAR;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
    }
    return out;
  }
  /** add a polygon of 3D points (flat [x,y,z,...]) to the current path, clipped to the near plane */
  function poly3(ctx, P) {
    const cs = []; for (let k = 0; k < P.length; k += 3) cs.push(cam3(P[k], P[k + 1], P[k + 2]));
    const o = clipPoly(cs); if (o.length < 3) return false;
    for (let k = 0; k < o.length; k++) { const sx = C.cx + C.F * o[k][0] / o[k][2], sy = C.cy - C.F * o[k][1] / o[k][2]; k ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
    ctx.closePath(); return true;
  }
  const gq = (ctx, x0, y0, x1, y1, z) => poly3(ctx, [x0, y0, z || 0, x1, y0, z || 0, x1, y1, z || 0, x0, y1, z || 0]);
  /** a ground segment, clipped to the near plane */
  function seg3(ctx, x0, y0, z0, x1, y1, z1) {
    let a = cam3(x0, y0, z0), b = cam3(x1, y1, z1);
    if (a[2] < NEAR && b[2] < NEAR) return false;
    if (a[2] < NEAR) { const t = (NEAR - a[2]) / (b[2] - a[2]); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]; }
    if (b[2] < NEAR) { const t = (NEAR - b[2]) / (a[2] - b[2]); b = [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t, NEAR]; }
    ctx.moveTo(C.cx + C.F * a[0] / a[2], C.cy - C.F * a[1] / a[2]); ctx.lineTo(C.cx + C.F * b[0] / b[2], C.cy - C.F * b[1] / b[2]); return true;
  }
  const front = (x, y, z, m) => cam3(x, y, z)[2] > (m || 0);
  const far = (x, y) => Math.hypot(x - C.ex, y - C.ey);

  /* ---------------- the stadium ---------------- */
  const SX0 = -14, SX1 = 134, SY0 = -9, SY1 = FIELD_W + 9, RISE = 24, ZB = 1.4, ZT = 23;
  let crowdPat = [null, null], patSrc = null;
  function stands(ctx, S, rect) {
    const tex = Render.tex(), cheer = S && S.ex > 0.55 ? 1 : 0;
    if (patSrc !== tex.crowd[0]) { patSrc = tex.crowd[0]; crowdPat = tex.crowd.map(c => ctx.createPattern(c, 'repeat')); }
    const sides = [ // [ax, ay, bx, by, outward nx, ny]
      [SX0, SY0, SX1, SY0, 0, -1], [SX1, SY0, SX1, SY1, 1, 0], [SX1, SY1, SX0, SY1, 0, 1], [SX0, SY1, SX0, SY0, -1, 0]];
    const segs = [];
    for (const [ax, ay, bx, by, nx, ny] of sides) {
      const L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 10), ux = (bx - ax) / L, uy = (by - ay) / L;
      for (let k = 0; k < n; k++) {
        const a0 = k * L / n, a1 = (k + 1) * L / n, x0 = ax + ux * a0, y0 = ay + uy * a0, x1 = ax + ux * a1, y1 = ay + uy * a1;
        const mx = (x0 + x1) / 2 + nx * RISE / 2, my = (y0 + y1) / 2 + ny * RISE / 2;
        if (!front(x0, y0, ZB, 0.5) && !front(x1, y1, ZB, 0.5) && !front(x0 + nx * RISE, y0 + ny * RISE, ZT, 0.5) && !front(x1 + nx * RISE, y1 + ny * RISE, ZT, 0.5)) continue;
        segs.push({ x0, y0, x1, y1, nx, ny, a0, L: a1 - a0, d: far(mx, my) });
      }
    }
    segs.sort((p, q) => q.d - p.d);
    const slant = Math.hypot(RISE, ZT - ZB), kv = 240 / 5.6, ku = 26, bands = Render.quality.level >= 2 ? 3 : 1;
    for (const g of segs) {
      const P = (al, s) => { const f = s / slant; return [g.x0 + (g.x1 - g.x0) * al / g.L + g.nx * RISE * f, g.y0 + (g.y1 - g.y0) * al / g.L + g.ny * RISE * f, ZB + (ZT - ZB) * f]; };
      // base: the concrete bowl
      ctx.beginPath(); if (!poly3(ctx, [...P(0, 0), ...P(g.L, 0), ...P(g.L, slant), ...P(0, slant)])) continue;
      ctx.fillStyle = '#10131c'; ctx.fill();
      if (Render.quality.level >= 1 && crowdPat[cheer] && typeof DOMMatrix !== 'undefined') {
        for (let b = 0; b < bands; b++) {
          const s0 = slant * b / bands, s1 = slant * (b + 1) / bands;
          const c00 = P(0, s0), c10 = P(g.L, s0), c01 = P(0, s1);
          if (!front(...c00, 1.2) || !front(...c10, 1.2) || !front(...c01, 1.2)) { // too close for an affine texture: plain colour
            continue;
          }
          const o = proj(...c00), pu = proj(...c10), pv = proj(...c01);
          const dU = [pu[0] - o[0], pu[1] - o[1]], dV = [pv[0] - o[0], pv[1] - o[1]], Lk = g.L * ku, Sk = (s1 - s0) * kv;
          const ta = dU[0] / Lk, tb = dU[1] / Lk, tc = -dV[0] / Sk, td = -dV[1] / Sk;
          const u0 = (g.a0 * ku) % 1536, v0 = (slant - s0) * kv;
          const m = new DOMMatrix([ta, tb, tc, td, o[0] - ta * u0 - tc * v0, o[1] - tb * u0 - td * v0]);
          crowdPat[cheer].setTransform(m);
          ctx.beginPath(); poly3(ctx, [...c00, ...c10, ...P(g.L, s1), ...c01]); ctx.fillStyle = crowdPat[cheer]; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      // the bowl rim and a little light on the lower rows
      ctx.beginPath(); if (poly3(ctx, [...P(0, slant - 0.6), ...P(g.L, slant - 0.6), ...P(g.L, slant), ...P(0, slant)])) { ctx.fillStyle = '#2a3348'; ctx.fill(); }
    }
    // front wall with a lit top edge
    ctx.beginPath();
    for (const [ax, ay, bx, by] of sides) {
      const L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 20);
      for (let k = 0; k < n; k++) { const f0 = k / n, f1 = (k + 1) / n, x0 = ax + (bx - ax) * f0, y0 = ay + (by - ay) * f0, x1 = ax + (bx - ax) * f1, y1 = ay + (by - ay) * f1; poly3(ctx, [x0, y0, 0, x1, y1, 0, x1, y1, ZB, x0, y0, ZB]); }
    }
    ctx.fillStyle = '#0c2350'; ctx.fill();
    ctx.beginPath();
    for (const [ax, ay, bx, by] of sides) seg3(ctx, ax, ay, ZB, bx, by, ZB);
    ctx.strokeStyle = 'rgba(120,180,255,0.75)'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  function lights(ctx) {
    // four light towers behind the corners + a ring of rim lights
    const towers = [[SX0 - 18, SY0 - 18], [SX1 + 18, SY0 - 18], [SX1 + 18, SY1 + 18], [SX0 - 18, SY1 + 18]];
    ctx.save(); ctx.lineCap = 'round';
    for (const [x, y] of towers) {
      if (!front(x, y, 30, 2)) continue;
      const b = proj(x, y, 6), tp = proj(x, y, 40), sc = C.F / tp[2];
      ctx.strokeStyle = '#2a3142'; ctx.lineWidth = Math.max(1, sc * 0.9); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
      const w = sc * 7, h = sc * 3.4;
      ctx.fillStyle = '#1c2230'; ctx.fillRect(tp[0] - w / 2, tp[1] - h, w, h);
      ctx.fillStyle = '#fffbe8';
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) ctx.fillRect(tp[0] - w / 2 + w * (c + 0.15) / 6, tp[1] - h + h * (r + 0.18) / 3, w * 0.7 / 6, h * 0.62 / 3);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y] of towers) {
      if (!front(x, y, 40, 2)) continue;
      const tp = proj(x, y, 41.7), sc = C.F / tp[2], R = Math.max(18, sc * 26);
      const g = ctx.createRadialGradient(tp[0], tp[1], 0, tp[0], tp[1], R);
      g.addColorStop(0, 'rgba(255,250,225,0.75)'); g.addColorStop(0.18, 'rgba(255,240,200,0.28)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(tp[0] - R, tp[1] - R, R * 2, R * 2);
    }
    if (Render.quality.level >= 2) {
      for (let k = 0; k < 16; k++) {
        const f = k / 16, per = 2 * (SX1 - SX0 + SY1 - SY0) + 8 * RISE; let d = f * per, x, y;
        const W1 = SX1 - SX0 + 2 * RISE, H1 = SY1 - SY0 + 2 * RISE, X0 = SX0 - RISE, Y0 = SY0 - RISE;
        if (d < W1) { x = X0 + d; y = Y0; } else if ((d -= W1) < H1) { x = X0 + W1; y = Y0 + d; } else if ((d -= H1) < W1) { x = X0 + W1 - d; y = Y0 + H1; } else { d -= W1; x = X0; y = Y0 + H1 - Math.min(H1, d); }
        if (!front(x, y, ZT + 1, 2)) continue;
        const p = proj(x, y, ZT + 1.2), R = Math.max(5, C.F / p[2] * 7);
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], R);
        g.addColorStop(0, 'rgba(255,248,220,0.5)'); g.addColorStop(1, 'rgba(255,248,220,0)'); ctx.fillStyle = g; ctx.fillRect(p[0] - R, p[1] - R, R * 2, R * 2);
      }
    }
    ctx.restore();
  }
  function field(ctx, S) {
    // surround + field stripes + end zones
    ctx.beginPath(); gq(ctx, SX0, SY0, SX1, SY1); ctx.fillStyle = '#1d4c1f'; ctx.fill();
    for (let x = 10; x < 110; x += 5) { ctx.beginPath(); if (gq(ctx, x, 0, x + 5, FIELD_W)) { ctx.fillStyle = (x / 5) % 2 ? '#3a8833' : '#33792d'; ctx.fill(); } }
    for (let e = 0; e < 2; e++) { ctx.beginPath(); if (gq(ctx, e ? 110 : 0, 0, e ? 120 : 10, FIELD_W)) { ctx.fillStyle = TEAM[e].ez; ctx.fill(); } }
    // white paint (lines within reach; hash marks only nearby so they don't shimmer)
    ctx.beginPath();
    gq(ctx, -0.33, -0.33, 120.33, 0); gq(ctx, -0.33, FIELD_W, 120.33, FIELD_W + 0.33); gq(ctx, -0.33, 0, 0, FIELD_W); gq(ctx, 120, 0, 120.33, FIELD_W);
    for (let x = 10; x <= 110; x += 5) { const w = x === 10 || x === 110 ? 0.2 : 0.1; gq(ctx, x - w, 0, x + w, FIELD_W); }
    for (let x = 11; x < 110; x++) {
      if (x % 5 === 0 || Math.abs(x - C.ex) > 34 || !front(x, C.ey, 0, -2)) continue;
      for (const [y0, y1] of [[0.6, 1.3], [FIELD_W - 1.3, FIELD_W - 0.6], [HASH[0] - 0.33, HASH[0] + 0.33], [HASH[1] - 0.33, HASH[1] + 0.33]]) if (far(x, (y0 + y1) / 2) < 36) gq(ctx, x - 0.07, y0, x + 0.07, y1);
    }
    ctx.fillStyle = 'rgba(250,250,245,0.9)'; ctx.fill();
    // yard numbers
    const nf = `800 100px ${DFONT}`;
    ctx.fillStyle = 'rgba(250,250,245,0.88)'; ctx.font = nf; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let x = 20; x <= 100; x += 10) {
      const n = String(x <= 60 ? x - 10 : 110 - x);
      for (const side of [0, 1]) {
        const y = side ? FIELD_W - 11.5 : 11.5, d = far(x, y); if (d > 55 || d < 2.5 || !front(x, y, 0, 2)) continue;
        const ux = side ? [1, 0] : [-1, 0], uy = side ? [0, 1] : [0, -1], off = side ? 1 : -1;
        for (let k = 0; k < 2; k++) {
          const cx = x + (k ? 0.95 : -0.95) * off, o = proj(cx, y), a = proj(cx + ux[0] * 0.02, y + ux[1] * 0.02), b = proj(cx + uy[0] * 0.02, y + uy[1] * 0.02);
          ctx.save(); ctx.transform(a[0] - o[0], a[1] - o[1], b[0] - o[0], b[1] - o[1], o[0], o[1]); ctx.fillText(n[k], 0, 0); ctx.restore();
        }
      }
    }
    // the broadcast lines: scrimmage (blue) and first down (yellow)
    if (S && (S.ph === 'presnap' || S.ph === 'live' || S.ph === 'select')) {
      for (const [x, col] of [[S.los, 'rgba(70,150,255,0.85)'], [S.fd, 'rgba(255,214,40,0.9)']]) {
        if (x == null || x <= 0 || x >= 120) continue;
        ctx.beginPath(); if (gq(ctx, x - 0.13, 0, x + 0.13, FIELD_W)) { ctx.fillStyle = col; ctx.fill(); }
      }
    }
    // goal posts
    ctx.lineCap = 'round';
    for (const gx of [0, 120]) {
      const back = gx === 0 ? -1.3 : 1.3, Y = MID_Y, hw = 3.08, cb = 3.33, up = 11.7;
      const sg = (a, b, w, col) => { const p = cam3(...a); if (p[2] < 1) return; ctx.beginPath(); if (seg3(ctx, ...a, ...b)) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, C.F / p[2] * w); ctx.stroke(); } };
      sg([gx + back, Y, 0], [gx + back, Y, cb - 0.6], 0.32, '#e8c21f'); sg([gx + back, Y, cb - 0.6], [gx, Y, cb], 0.26, '#e8c21f');
      sg([gx, Y - hw, cb], [gx, Y + hw, cb], 0.2, '#f2cf2a'); sg([gx, Y - hw, cb], [gx, Y - hw, cb + up], 0.15, '#f5d533'); sg([gx, Y + hw, cb], [gx, Y + hw, cb + up], 0.15, '#f5d533');
    }
  }

  /* ---------------- intent cues ---------------- */
  function groundRing(ctx, x, y, r, col, w, dash) {
    ctx.beginPath(); let started = false;
    for (let k = 0; k <= 28; k++) { const a = k / 28 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, c = cam3(px, py, 0.02); if (c[2] < NEAR) { started = false; continue; } const sx = C.cx + C.F * c[0] / c[2], sy = C.cy - C.F * c[1] / c[2]; started ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); started = true; }
    const s = scale(x, y); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, Math.min(C.F * 0.014, s * w)); ctx.setLineDash(dash ? [s * 0.3, s * 0.22] : []); ctx.stroke(); ctx.setLineDash([]);
  }
  function groundArrow(ctx, pts, col, w, head, dash) {
    if (pts.length < 2) return;
    { // stop short of my own feet: an arrow aimed at me ends a yard out (else it smears across the lens)
      const e = pts[pts.length - 1], a = pts[pts.length - 2], de = Math.hypot(e[0] - C.ex, e[1] - C.ey);
      if (de < 1.6) { const dx = e[0] - a[0], dy = e[1] - a[1], n = Math.hypot(dx, dy); const cut = 1.6 - de; if (n <= cut + 0.3) return; pts = pts.slice(0, -1).concat([[e[0] - dx / n * cut, e[1] - dy / n * cut]]); }
    }
    ctx.beginPath(); for (let k = 1; k < pts.length; k++) seg3(ctx, pts[k - 1][0], pts[k - 1][1], 0.04, pts[k][0], pts[k][1], 0.04);
    let s = 1e9; for (const q of pts) s = Math.min(s, scale(q[0], q[1])); // the far end sets the width: perspective lines stay lines
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.4, Math.min(C.F * 0.012, s * w)); ctx.setLineDash(dash ? [Math.max(4, s * 0.45), Math.max(3, s * 0.3)] : []); ctx.stroke(); ctx.setLineDash([]);
    if (head) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, L = 0.9;
      if (!front(b[0], b[1], 0, NEAR + 0.2)) return;
      ctx.beginPath(); poly3(ctx, [b[0], b[1], 0.04, b[0] - ux * L - uy * L * 0.5, b[1] - uy * L + ux * L * 0.5, 0.04, b[0] - ux * L + uy * L * 0.5, b[1] - uy * L - ux * L * 0.5, 0.04]);
      ctx.fillStyle = col; ctx.fill();
    }
  }
  function cueText(c, S) {
    const K = KIND[c.k]; if (!K) return '';
    const num = o => (o >= 0 && S.pl[o] ? '#' + S.pl[o][5] : '');
    if (c.k === 'rush') { const role = Render.playerInfo(S, c.i).role; return role === 'DT' || role === 'DE' ? 'RUSH' : 'BLITZ'; }
    if (c.k === 'block') return c.onMe ? 'BLOCKING YOU' : 'BLOCK ' + num(c.o);
    if (c.k === 'man' || c.k === 'cover') return K.t + ' ' + num(c.o);
    if ((c.k === 'pursue' || c.k === 'close' || c.k === 'fill') && !c.onMe && c.o >= 0) return K.t;
    return K.t;
  }
  /** cue lines + rings on the ground (under the players) */
  function drawCuesUnder(ctx, S, cs, own) {
    const t = C.t;
    for (const c of cs.vis) {
      const K = KIND[c.k], q = S.pl[c.i]; if (!K || q[4] === 1) continue;
      const showLine = c.threat || (c.mine && (c.k === 'block' || c.k === 'lead')) || (c.k === 'block' && c.onMe) || c.k === 'run' || c.k === 'catch' || c.k === 'scram';
      if (showLine && c.tx != null && Math.hypot(c.tx - q[0], c.ty - q[1]) > 0.6) {
        const alpha = c.threat ? 0.95 : 0.75;
        ctx.globalAlpha = alpha; groundArrow(ctx, [[q[0], q[1]], [c.tx, c.ty]], K.c, 0.09, true, !c.threat); ctx.globalAlpha = 1;
      }
      if (c.k === 'dive') { const p = 0.5 + 0.5 * Math.sin(t * 22); groundRing(ctx, q[0], q[1], 0.75 + p * 0.25, `rgba(255,45,45,${0.6 + p * 0.4})`, 0.12); }
      else if (c.threat || c.onMe) groundRing(ctx, q[0], q[1], 0.75, K.c, 0.07);
      else groundRing(ctx, q[0], q[1], 0.7, K.c, 0.045, true);
    }
    // routes: full routes for my own receivers on a pass play, only the next leg for theirs
    if (S.rt) for (const c of cs.vis) {
      const r = S.rt[c.i]; if (!r || !r.length) continue; const q = S.pl[c.i];
      const pts = [[q[0], q[1]]].concat(c.mine ? r : r.slice(0, 1));
      ctx.globalAlpha = c.mine ? 0.85 : 0.6; groundArrow(ctx, pts, c.mine ? '#8fe8ff' : '#5fd0ff', 0.07, true, true); ctx.globalAlpha = 1;
    }
    // my QB target
    if (S.aim && own.me != null && S.aim[own.me] >= 0 && S.b[4] === own.i && !S.thrown && S.kind === 'pass') {
      const r = S.pl[S.aim[own.me]]; if (r && inView(view(), r[0], r[1])) groundRing(ctx, r[0], r[1], 1.0, 'rgba(120,230,255,0.95)', 0.09, true);
    }
    // where the ball is coming down
    if (S.bt && S.b[3] === 1 && S.b[5] && front(S.bt[0], S.bt[1], 0, 1)) { const p = 0.5 + 0.5 * Math.sin(t * 9); groundRing(ctx, S.bt[0], S.bt[1], 0.6 + p * 0.3, 'rgba(255,240,140,0.9)', 0.08); }
  }
  function pill(ctx, x, y, s, col, fs, solid) {
    ctx.font = `800 ${fs}px ${DFONT}`; const w = ctx.measureText(s).width + fs * 0.9, h = fs * 1.45;
    ctx.fillStyle = solid ? col : 'rgba(6,10,20,0.78)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h, w, h, h / 2) : ctx.rect(x - w / 2, y - h, w, h); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = solid ? '#000' : col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y - h / 2 + 0.5);
  }
  /** labels over heads (after the players): the nearest few with something to say, and every "!" */
  function drawCueLabels(ctx, S, cs, rect) {
    const fs = Math.max(9, Math.min(13, rect.h / 30)), t = C.t;
    const list = cs.vis.filter(c => KIND[c.k] && S.pl[c.i][4] !== 1 && c.k !== 'engaged').sort((a, b) => (b.k === 'dive') - (a.k === 'dive') || (b.threat || b.onMe) - (a.threat || a.onMe) || a.dist - b.dist);
    let n = 0; const boxes = [];
    for (const c of list) {
      const q = S.pl[c.i], hp = proj(q[0], q[1], 2.25); if (hp[2] < 0.8) continue;
      if (hp[0] < rect.x - 20 || hp[0] > rect.x + rect.w + 20) continue;
      const K = KIND[c.k];
      if (c.k === 'dive') { // the dive window: a flashing "!" over his helmet
        const p = 0.5 + 0.5 * Math.sin(t * 24), R = Math.max(9, Math.min(26, scale(q[0], q[1]) * 0.42)) * (1 + p * 0.15);
        ctx.save(); ctx.shadowColor = 'rgba(255,40,40,0.9)'; ctx.shadowBlur = 12 * p;
        ctx.fillStyle = `rgba(255,${40 + p * 40},40,0.95)`; ctx.beginPath(); ctx.arc(hp[0], hp[1] - R, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = `900 ${R * 1.5}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', hp[0], hp[1] - R + R * 0.08);
        continue;
      }
      if (n >= 4 || c.dist > 30 || hp[1] < clearY + fs * 1.6) continue; // (not up under the scoreboard)
      // keep tags from piling on each other: nudge up (once or twice), else skip it
      const txt = cueText(c, S); ctx.font = `800 ${fs}px ${DFONT}`; const w = ctx.measureText(txt).width + fs * 0.9, h = fs * 1.45;
      let y = hp[1] - 2, tries = 0; const hit = yy => boxes.some(b => Math.abs(b[0] - hp[0]) < (b[2] + w) / 2 + 3 && Math.abs(b[1] - yy) < h + 2);
      while (hit(y) && tries < 3) { y -= h + 3; tries++; }
      if (hit(y)) continue;
      boxes.push([hp[0], y, w]); n++;
      pill(ctx, hp[0], y, txt, K.c, fs, c.threat && c.k === 'close');
    }
  }
  function drawBehind(ctx, S, cs, rect) {
    const t = C.t;
    for (const b of cs.behind.slice(0, 2)) {
      const side = b.ang >= 0 ? 1 : -1, k = Math.max(0, Math.min(1, 1 - b.dist / 8)), behind = Math.abs(b.ang) > 2.5;
      const x = behind ? rect.x + rect.w / 2 : side > 0 ? rect.x + rect.w - 6 : rect.x + 6;
      const y = behind ? rect.y + rect.h * 0.8 : rect.y + rect.h * (0.42 + 0.3 * Math.min(1, (Math.abs(b.ang) - C.hfov / 2) / 1.6));
      const p = 0.5 + 0.5 * Math.sin(t * 14);
      // edge glow
      const gw = rect.w * 0.16, g = behind ? ctx.createLinearGradient(0, rect.y + rect.h, 0, rect.y + rect.h - rect.h * 0.25) : ctx.createLinearGradient(x, 0, x - side * gw, 0);
      g.addColorStop(0, `rgba(255,40,40,${(0.25 + 0.35 * k) * (0.7 + 0.3 * p)})`); g.addColorStop(1, 'rgba(255,40,40,0)');
      ctx.fillStyle = g; if (behind) ctx.fillRect(rect.x, rect.y + rect.h * 0.75, rect.w, rect.h * 0.25); else ctx.fillRect(side > 0 ? rect.x + rect.w - gw : rect.x, rect.y, gw, rect.h);
      // chevron + label
      const s = Math.max(10, Math.min(18, rect.h / 22)) * (1 + k * 0.3);
      ctx.save(); ctx.translate(x, y); if (behind) ctx.rotate(Math.PI / 2); else if (side < 0) ctx.rotate(Math.PI);
      ctx.fillStyle = `rgba(255,70,60,${0.75 + 0.25 * p})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, -s * 0.8); ctx.lineTo(-s * 0.55, 0); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill(); ctx.restore();
      const fs = Math.max(9, Math.min(12, rect.h / 32));
      const lab = (behind ? 'BEHIND YOU' : 'BLIND SIDE') + ' · #' + S.pl[b.i][5] + ' ' + b.dist.toFixed(0) + ' YD';
      ctx.font = `800 ${fs}px ${DFONT}`; const tw = ctx.measureText(lab).width;
      const lx = behind ? x : side > 0 ? x - s - 6 - tw / 2 - 6 : x + s + 6 + tw / 2 + 6;
      pill(ctx, lx, y + fs * 0.75, lab, '#ff5a4a', fs, false);
    }
  }

  /* ---------------- first-person overlays ---------------- */
  let vig = null, vigKey = '';
  function vignette(ctx, rect) {
    const key = Math.round(rect.w) + 'x' + Math.round(rect.h);
    if (key !== vigKey) {
      vigKey = key; vig = document.createElement('canvas'); vig.width = Math.max(1, Math.round(rect.w / 2)); vig.height = Math.max(1, Math.round(rect.h / 2));
      const v = vig.getContext('2d'), w = vig.width, h = vig.height;
      const g = v.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.8)'); v.fillStyle = g; v.fillRect(0, 0, w, h);
      // the inside of the shell at the top corners
      const g2 = v.createLinearGradient(0, 0, 0, h * 0.16); g2.addColorStop(0, 'rgba(0,0,0,0.65)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); v.fillStyle = g2; v.fillRect(0, 0, w, h * 0.16);
    }
    ctx.drawImage(vig, rect.x, rect.y, rect.w, rect.h);
  }
  /** the facemask: two horizontal bars and a centre bar across the bottom of the view, slightly out of focus */
  function facemask(ctx, rect, T) {
    const x0 = rect.x, w = rect.w, h = rect.h, by = rect.y + h, sway = C.sway * w * 0.5, bob = -C.bob * h * 0.4;
    const bar = (pts, th) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k += 2) ctx.quadraticCurveTo(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
      ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(8,10,14,0.88)'; ctx.lineWidth = th * 1.35; ctx.stroke();
      ctx.strokeStyle = '#3c4250'; ctx.lineWidth = th; ctx.stroke();
      ctx.strokeStyle = 'rgba(220,228,240,0.35)'; ctx.lineWidth = th * 0.25; ctx.save(); ctx.translate(0, -th * 0.22); ctx.stroke(); ctx.restore();
    };
    const th = Math.max(4, Math.min(h * 0.035, w * 0.026));
    ctx.save(); ctx.translate(sway, bob);
    bar([[x0 - w * 0.05, by - h * 0.06], [x0 + w * 0.5, by - h * 0.2], [x0 + w * 1.05, by - h * 0.06]], th);
    bar([[x0 - w * 0.05, by + h * 0.04], [x0 + w * 0.5, by - h * 0.07], [x0 + w * 1.05, by + h * 0.04]], th * 1.1);
    bar([[x0 + w * 0.5, by - h * 0.2], [x0 + w * 0.5, by - h * 0.12], [x0 + w * 0.5, by + h * 0.02]], th * 0.9);
    // side posts of the cage, out at the edges
    bar([[x0 - w * 0.02, by - h * 0.42], [x0 + w * 0.035, by - h * 0.2], [x0 + w * 0.02, by + h * 0.02]], th * 1.3);
    bar([[x0 + w * 1.02, by - h * 0.42], [x0 + w * 0.965, by - h * 0.2], [x0 + w * 0.98, by + h * 0.02]], th * 1.3);
    ctx.restore();
    // a hint of the shell, in team colour, at the very top corners
    ctx.save(); ctx.globalAlpha = 0.55;
    for (const s of [-1, 1]) { const cx = s < 0 ? x0 : x0 + w; const g = ctx.createRadialGradient(cx, rect.y, 0, cx, rect.y, w * 0.22); g.addColorStop(0, T.helmet2); g.addColorStop(0.7, T.helmet2); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, rect.y, w * 0.22, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  /** my own arms and the ball when I'm carrying it */
  function myBall(ctx, rect, T, S, i) {
    const h = rect.h, w = rect.w, qbHold = Render.playerInfo(S, i).qbHold;
    const bx = rect.x + w * (qbHold ? 0.6 : 0.74) + C.sway * w * 0.6, by = rect.y + h * (qbHold ? 0.84 : 0.9) + Math.sin(C.ph * 2) * h * 0.012 - C.bob * h * 0.5;
    const s = Math.min(w, h) * 0.95;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = T.jersey2; ctx.lineWidth = s * 0.15; ctx.beginPath(); ctx.moveTo(rect.x + w * 0.98, rect.y + h * 1.08); ctx.lineTo(bx + s * 0.1, by + s * 0.05); ctx.stroke();
    ctx.strokeStyle = T.jersey; ctx.lineWidth = s * 0.12; ctx.stroke();
    Render.drawBallAt(ctx, bx, by, s * 0.75, qbHold ? -0.3 : -0.55, 0.4);
    ctx.fillStyle = (i < 7 ? 0 : 1) ? '#f1f1f1' : '#1b1b1b'; ctx.beginPath(); ctx.ellipse(bx + s * 0.08, by + s * 0.03, s * 0.075, s * 0.055, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------------- the frame ---------------- */
  let lastBehind = new Map(), clearY = 0;
  /** draw the helmet view of `me` into rect (CSS px). opt: { alpha, top (y below which labels are safe), pip } */
  function draw(ctx, S, me, dt, rect, opt) {
    opt = opt || {};
    const DPR = Render.DPR;
    if (!S || !update(S, me, dt)) return;
    setup(rect, opt.clear); clearY = Math.max(rect.y, opt.clear || 0);
    const i = C.i, q = S.pl[i], T = TEAM[i < 7 ? 0 : 1];
    ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1;
    // panel
    const rr = opt.pip ? Math.min(14, rect.w * 0.05) : 0;
    ctx.beginPath(); ctx.roundRect && rr ? ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rr) : ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.save(); ctx.clip();
    // world, with the camera's roll, bob and tackle shake
    ctx.save();
    const sh = st.shake ? C.shake : 0, shx = sh ? (Math.random() - 0.5) * sh * rect.h * 0.05 : 0, shy = sh ? (Math.random() - 0.5) * sh * rect.h * 0.05 : 0;
    ctx.translate(C.cx + shx, C.cy + shy); ctx.rotate(C.roll + (sh ? (Math.random() - 0.5) * sh * 0.04 : 0)); ctx.translate(-C.cx, -C.cy);
    const big = Math.hypot(rect.w, rect.h), hy = C.cy - C.F * Math.tan(C.pitch);
    const sky = ctx.createLinearGradient(0, hy - rect.h * 0.9, 0, hy);
    sky.addColorStop(0, '#02030a'); sky.addColorStop(0.6, '#0b1430'); sky.addColorStop(1, '#25365f');
    ctx.fillStyle = sky; ctx.fillRect(C.cx - big, C.cy - big, big * 2, big * 2);
    lights(ctx);
    stands(ctx, S, rect);
    field(ctx, S);
    // distance haze over the far field
    { const g = ctx.createLinearGradient(0, hy - 4, 0, hy + C.F * C.ez / 22); g.addColorStop(0, 'rgba(40,58,96,0.55)'); g.addColorStop(1, 'rgba(40,58,96,0)'); ctx.fillStyle = g; ctx.fillRect(C.cx - big, hy - 4, big * 2, C.F * C.ez / 22 + 4); }
    const v = view(), cs = cues(S, me, v); cs.me = me;
    if (S.ph === 'live') drawCuesUnder(ctx, S, cs, { me, i });
    // players + ball, far to near
    const order = [];
    for (let j = 0; j < S.pl.length; j++) { if (j === i) continue; const p = S.pl[j], d = cam3(p[0], p[1], 1)[2]; if (d < 1.15) continue; const sx = proj(p[0], p[1], 1)[0], m = C.F / d * 1.5; if (sx < rect.x - m || sx > rect.x + rect.w + m) continue; order.push([d, j]); }
    const b = S.b, loose = !(b[3] === 0 && b[4] >= 0);
    if (loose) { const d = cam3(b[0], b[1], b[2])[2]; if (d > 0.5) order.push([d, -1]); }
    order.sort((a, c) => c[0] - a[0]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    Render.withView({ proj, scale, toCam }, () => {
      for (const [d, j] of order) {
        if (j < 0) { // the ball (in the air, loose or dead)
          const sh0 = proj(b[0], b[1], 0), p = proj(b[0], b[1], b[2]), s = C.F / Math.max(0.5, d);
          ctx.fillStyle = `rgba(0,0,0,${Math.max(0.1, 0.42 - b[2] * 0.025)})`; ctx.beginPath(); ctx.ellipse(sh0[0], sh0[1], s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
          Render.drawBallAt(ctx, p[0], p[1], s * 1.1, b[3] === 1 ? -0.4 : 0.2, C.t * 30);
          continue;
        }
        ctx.globalAlpha = d < 2.6 ? Math.max(0.2, (d - 1.15) / 1.45) : 1; // a man right in your face goes see-through, so he can't blind you
        Render.drawPlayer(ctx, S, j, 0, Render.playerInfo(S, j));
        ctx.globalAlpha = 1;
      }
    });
    if (S.ph === 'live') drawCueLabels(ctx, S, cs, rect);
    ctx.restore(); // roll
    // first-person: my arms + the ball, the cage, the vignette
    if (b[3] === 0 && b[4] === i && q[4] !== 1) myBall(ctx, rect, T, S, i);
    facemask(ctx, rect, T);
    vignette(ctx, rect);
    if (S.ph === 'live') {
      drawBehind(ctx, S, cs, rect);
      // a new blind-side pursuer within 4 yd: a quick glance cue (sound + flash), once per man
      const tn = C.t;
      for (const bh of cs.behind) if (bh.dist < 4 && (!lastBehind.has(bh.i) || tn - lastBehind.get(bh.i) > 2.5)) { lastBehind.set(bh.i, tn); if (typeof Sound !== 'undefined' && st.k > 0.9) Sound.play('glance'); }
    } else lastBehind.clear();
    if (C.sw > 0) { ctx.fillStyle = `rgba(255,255,255,${C.sw * 0.5})`; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
    // chrome: who I am, what the defense has read
    const top = Math.max(rect.y, opt.top || rect.y) + 8, fs = Math.max(10, Math.min(13, rect.h / 26));
    {
      const role = Render.playerInfo(S, i).role, lab = 'HELMET CAM  ·  #' + q[5] + ' ' + role;
      ctx.font = `800 ${fs}px ${DFONT}`; const tw = ctx.measureText(lab).width, hh = fs * 1.7, lx = rect.x + 10;
      ctx.fillStyle = 'rgba(4,8,18,0.72)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, top, tw + fs * 2.2, hh, hh / 2) : ctx.rect(lx, top, tw + fs * 2.2, hh); ctx.fill();
      ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(lx + fs * 0.85, top + hh / 2, fs * 0.3 * (0.75 + 0.25 * Math.sin(C.t * 5)), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = T.ui; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lab, lx + fs * 1.5, top + hh / 2 + 0.5);
    }
    if (cs.key && S.ph !== 'select') {
      const myTeam = i < 7 ? 0 : 1, lab = (myTeam === S.off ? 'D IS KEYING ON ' : 'YOU KEY ON ') + cs.key.replace(/^THE /, '');
      ctx.font = `800 ${fs}px ${DFONT}`; const tw = ctx.measureText(lab).width + fs * 1.4, hh = fs * 1.7, lx = rect.x + rect.w - tw - 10, ly = top + (rect.w < tw * 2.3 ? hh + 6 : 0);
      const x = rect.w < tw * 2.3 ? rect.x + 10 : lx;
      ctx.fillStyle = 'rgba(4,8,18,0.72)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, ly, tw, hh, hh / 2) : ctx.rect(x, ly, tw, hh); ctx.fill();
      ctx.strokeStyle = 'rgba(143,211,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#8fd3ff'; ctx.textAlign = 'left'; ctx.fillText(lab, x + fs * 0.7, ly + hh / 2 + 0.5);
    }
    if (S.ctr && (S.ph === 'live' || S.ph === 'result')) { // the defense sold out: which counter it called
      const lab = 'D SOLD OUT: ' + S.ctr[0];
      ctx.font = `800 ${fs}px ${DFONT}`; const tw = ctx.measureText(lab).width + fs * 1.4, hh = fs * 1.7, x = rect.x + 10, ly = rect.y + rect.h - hh - 10;
      ctx.fillStyle = 'rgba(30,8,4,0.78)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, ly, tw, hh, hh / 2) : ctx.rect(x, ly, tw, hh); ctx.fill();
      ctx.strokeStyle = 'rgba(255,154,60,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ff9a3c'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lab, x + fs * 0.7, ly + hh / 2 + 0.5);
    }
    ctx.restore(); // clip
    // border
    ctx.beginPath(); ctx.roundRect && rr ? ctx.roundRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, rr) : ctx.rect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = T.ui; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.restore();
  }
  /** on the broadcast view: the helmet's field of view as a cone on the grass */
  function drawCone(ctx, S, me) {
    if (st.k < 0.02 || !S || !(S.ph === 'live' || S.ph === 'presnap')) return;
    const i = ownerOf(S, me); if (i < 0 || i !== C.i) return;
    const q = S.pl[i], R = 20, a0 = C.yaw - C.hfov / 2, a1 = C.yaw + C.hfov / 2, P = Render.proj;
    const apex = P(q[0], q[1], 0.03), mid = P(q[0] + Math.cos(C.yaw) * R, q[1] + Math.sin(C.yaw) * R, 0.03);
    ctx.save(); ctx.globalAlpha = Math.min(1, st.k);
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]);
    for (let k = 0; k <= 16; k++) { const a = a0 + (a1 - a0) * k / 16, p = P(q[0] + Math.cos(a) * R, q[1] + Math.sin(a) * R, 0.03); ctx.lineTo(p[0], p[1]); }
    ctx.closePath();
    const g = ctx.createLinearGradient(apex[0], apex[1], mid[0], mid[1]); g.addColorStop(0, 'rgba(255,236,140,0.30)'); g.addColorStop(0.6, 'rgba(255,236,140,0.10)'); g.addColorStop(1, 'rgba(255,236,140,0)');
    ctx.fillStyle = g; ctx.fill();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,236,140,0.55)'; ctx.lineWidth = 1.3; ctx.beginPath();
    for (const a of [a0, a1]) { const p = P(q[0] + Math.cos(a) * R * 0.75, q[1] + Math.sin(a) * R * 0.75, 0.03); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(p[0], p[1]); }
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }
  /** a short "HELMET CAM ON/OFF" toast on the main view */
  function drawToast(ctx, L) {
    if (!st.toast) return; const age = (now() - st.toast.t0) / 1000; if (age > 1.3) { st.toast = null; return; }
    const a = Math.min(1, (1.3 - age) / 0.3, age / 0.08), fs = L.small ? 14 : 17, f = L.field || { x: 0, y: 0, w: L.W, h: L.H };
    ctx.save(); ctx.globalAlpha = a; ctx.font = `900 ${fs}px ${DFONT}`; const tw = ctx.measureText(st.toast.s).width + fs * 2, hh = fs * 2;
    const x = f.x + f.w / 2 - tw / 2, y = f.y + f.h * 0.3;
    ctx.fillStyle = 'rgba(4,8,18,0.82)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, tw, hh, hh / 2) : ctx.rect(x, y, tw, hh); ctx.fill();
    ctx.strokeStyle = st.on ? '#ffd23c' : '#8a93a8'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = st.on ? '#ffd23c' : '#c9d0de'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st.toast.s, x + tw / 2, y + hh / 2 + 1);
    ctx.restore();
  }
  /** the HELMET CAM button glyph: a little helmet in profile */
  function glyph(ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, s * 0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.5, Math.PI * 0.95, Math.PI * 0.2, false); ctx.lineTo(s * 0.12, s * 0.28); ctx.lineTo(-s * 0.48, s * 0.28); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.32, s * 0.02); ctx.lineTo(s * 0.68, s * 0.02); ctx.moveTo(s * 0.3, s * 0.2); ctx.lineTo(s * 0.62, s * 0.24); ctx.moveTo(s * 0.62, s * 0.0); ctx.lineTo(s * 0.62, s * 0.3); ctx.stroke();
    ctx.restore();
  }
  return { st, KIND, ownerOf, inView, cues, toggle, setOn, setShake, cycleOption, optionLabel, update, onEvent, draw, drawCone, drawToast, glyph, view, cam: C, HFOV,
    get on() { return st.on; } };
})();
