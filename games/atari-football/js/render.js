/* ==========================================================================
   ATARI FOOTBALL — render.js
   Draws a game snapshot (from the local sim or from the host) into the
   480x300 frame buffer: scrolling field, players, ball, HUD, banners,
   play reveal, kick meter and off-screen player arrows.
   view = { local: [bool, bool]  (which teams are controlled on this screen),
            hi: [color, color] }
   ========================================================================== */
const Render = (() => {
  let blinkT = 0;
  const ROLE_NAME = { C: 'CENTER', LG: 'GUARD', RG: 'GUARD', QB: 'QB', RB: 'RB', WR1: 'WR', WR2: 'WR', LE: 'END', NT: 'NOSE T', RE: 'END', MLB: 'LB', CB1: 'CB', CB2: 'CB', S: 'SAFETY', K: 'KICKER', COV: 'COVER', KR: 'RETURN', KB: 'BLOCK' };
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const yardText = x => { const y = Math.round(x <= 60 ? x - 10 : 110 - x); if (y <= 0) return 'GOAL'; if (y === 50) return '50'; return (x < 60 ? TEAMS[0].name : TEAMS[1].name) + ' ' + y; };

  function camera(S, dt, snap) {
    let fx = S.b[0], fy = S.b[1];
    if (S.ph === 'select' || S.ph === 'presnap') { fx = S.los + teamDir(S.off) * 8; fy = MID_Y; }
    if (S.ph === 'live' && S.bt && (S.bt[2] === 'punt' || S.bt[2] === 'kickoff' || S.bt[2] === 'fg')) { fx = lerp(S.b[0], S.bt[0], 0.4); }
    Field.follow(fx, fy, dt, snap);
  }

  function draw(ctx, S, view, dt) {
    blinkT += dt;
    const blink = (blinkT * 4 | 0) % 2 === 0;
    const scrim = S.kind !== 'kickoff' && S.ph !== 'kickset';
    Field.draw(ctx, scrim && (S.ph === 'select' || S.ph === 'presnap' || S.ph === 'live') ? S.los : null, scrim && S.fd != null && (S.ph === 'select' || S.ph === 'presnap' || S.ph === 'live') ? S.fd : null);
    // landing marker for passes & kicks
    if (S.bt && S.bt[2] !== 'snap' && S.bt[2] !== 'pitch') Field.marker(ctx, S.bt[0], S.bt[1], S.bt[2] === 'pass' ? '#ffffff' : '#ffe048', blink);
    // players back-to-front
    const order = S.pl.map((p, i) => i).sort((a, b) => S.pl[a][1] - S.pl[b][1]);
    const tgtShow = [0, 1].map(t => view.local[t] && S.ph === 'live' && S.off === t && S.kind === 'pass' && !S.thrown && S.b[4] === t * 7 + 3);
    for (const i of order) {
      const p = S.pl[i], team = i < 7 ? 0 : 1;
      const hi = view.local[team] && S.ctl[team] === i && S.ph !== 'over';
      Field.player(ctx, p[0], p[1], {
        team, face: p[2], frame: p[3], moving: p[4], down: p[5] === 1, dive: p[5] === 2, ball: S.b[4] === i && S.b[3] === 0,
        hi, blink, hiColor: view.hi[team], tgt: tgtShow[team] && S.tgt[team] === i, tgtColor: view.hi[team],
      });
    }
    if (S.b[4] < 0 && S.b[3] !== 0 || (S.b[4] < 0)) Field.ball(ctx, S.b[0], S.b[1], S.b[2]);
    // arrows toward controlled players that are off screen
    for (const t of [0, 1]) if (view.local[t] && S.ph === 'live') {
      const p = S.pl[S.ctl[t]]; const sx = Field.sx(p[0]), sy = Field.sy(p[1]);
      if (sx < 2 || sx > VW - 2 || sy < HUD_H + 2 || sy > VH - 2) {
        const ex = clamp(sx, 6, VW - 7), ey = clamp(sy, HUD_H + 6, VH - 7);
        Px.rect(ctx, ex - 2, ey - 2, 5, 5, view.hi[t]); Px.rect(ctx, ex - 1, ey - 1, 3, 3, TEAMS[t].main);
      }
    }
    hud(ctx, S, view);
    if (S.rv && S.ph !== 'select') reveal(ctx, S);
    if (S.mt && view.local[S.off] && !S.mt[2]) meter(ctx, S);
    if (S.bn && S.ph !== 'over') bannerBox(ctx, S.bn);
  }

  function hud(ctx, S, view) {
    Px.rect(ctx, 0, 0, VW, HUD_H, PAL.hud); Px.rect(ctx, 0, HUD_H - 1, VW, 1, PAL.hudLine);
    const pos = t => (S.off === t && S.kind !== 'kickoff' ? '`' : ' ');
    FONT.draw(ctx, pos(0) + TEAMS[0].name + ' ' + String(S.sc[0]).padStart(2, ' '), 6, 3, TEAMS[0].main, 1);
    FONT.draw(ctx, String(S.sc[1]).padStart(2, ' ') + ' ' + TEAMS[1].name + pos(1), VW - 6, 3, TEAMS[1].main, 1, 'r');
    const low = S.clk < 10 && S.ph === 'live';
    FONT.draw(ctx, 'Q' + Math.min(4, S.q) + '  ' + mmss(S.clk), VW / 2, 3, low ? '#ff6060' : PAL.text, 1, 'c');
    let line2;
    if (S.kind === 'kickoff' || S.ph === 'kickset') line2 = 'KICKOFF';
    else line2 = Sim.ordinal(S.dn) + ' & ' + S.tg + '   BALL ON ' + yardText(S.los);
    FONT.draw(ctx, line2, 6, 13, PAL.dim, 1);
    // controlled-player indicator
    const parts = [];
    for (const t of [0, 1]) if (view.local[t] && S.ph !== 'select' && S.ph !== 'over') { const r = S.roles[S.ctl[t]]; parts.push({ s: (view.names ? view.names[t] : 'YOU') + ': ' + (ROLE_NAME[r] || r), c: view.hi[t] === '#ffffff' ? TEAMS[t].main : view.hi[t] }); }
    let x = VW - 6;
    for (const p of parts.reverse()) { FONT.draw(ctx, p.s, x, 13, p.c, 1, 'r'); x -= FONT.width(p.s) + 12; }
  }

  function reveal(ctx, S) {
    const offN = S.rv.off, defN = S.rv.def, t = S.rv.t; if (t > 2.4) return;
    const s = offN + '  VS  ' + defN, w = FONT.width(s) + 12;
    const x = Math.round(VW / 2 - w / 2), y = HUD_H + 4;
    Px.rect(ctx, x, y, w, 13, '#000000'); Px.frame(ctx, x, y, w, 13, '#ffffff');
    FONT.draw(ctx, offN, x + 6, y + 3, TEAMS[S.off].main);
    FONT.draw(ctx, 'VS', x + 6 + FONT.width(offN + '  '), y + 3, '#ffffff');
    FONT.draw(ctx, defN, x + 6 + FONT.width(offN + '  VS  '), y + 3, TEAMS[1 - S.off].main);
  }

  function meter(ctx, S) {
    const [v, locked] = S.mt, x = VW / 2 - 60, y = VH - 22, w = 120;
    Px.rect(ctx, x - 4, y - 12, w + 8, 22, '#000000'); Px.frame(ctx, x - 4, y - 12, w + 8, 22, '#ffffff');
    FONT.draw(ctx, locked ? 'LOCKED!' : 'KICK: PRESS ACTION', VW / 2, y - 10, locked ? '#60ff60' : '#ffffff', 1, 'c');
    for (let i = 0; i < w; i++) { const d = Math.abs(i / w - 0.5) * 2; Px.rect(ctx, x + i, y, 1, 6, d < 0.15 ? '#60ff60' : d < 0.5 ? '#ffe048' : '#ff6040'); }
    const mx = x + Math.round(v * (w - 1)); Px.rect(ctx, mx - 1, y - 2, 3, 10, '#ffffff');
  }

  function bannerBox(ctx, bn) {
    if (bn.t < 0.05) return;
    const big = bn.txt, sub = bn.sub || '';
    const w = Math.max(FONT.width(big, 2), FONT.width(sub)) + 24, h = sub ? 38 : 26;
    const x = Math.round(VW / 2 - w / 2), y = Math.round(HUD_H + (VH - HUD_H) / 2 - h / 2 - 20);
    Px.rect(ctx, x + 3, y + 3, w, h, 'rgba(0,0,0,0.5)');
    Px.rect(ctx, x, y, w, h, '#0c0c24'); Px.frame(ctx, x, y, w, h, bn.c || '#ffffff'); Px.frame(ctx, x + 2, y + 2, w - 4, h - 4, '#3048b0');
    FONT.shadow(ctx, big, VW / 2, y + 7, bn.c || '#ffffff', 2, 'c');
    if (sub) FONT.draw(ctx, sub, VW / 2, y + 26, '#ffffff', 1, 'c');
  }

  /** interpolate two snapshots (guest smoothing) */
  function lerpSnap(a, b, u) {
    if (!a || a.ph !== b.ph || a.kind !== b.kind || u >= 1) return b;
    const o = Object.assign({}, b);
    o.pl = b.pl.map((p, i) => { const q = a.pl[i]; if (Math.abs(p[0] - q[0]) > 6 || Math.abs(p[1] - q[1]) > 6) return p; return [lerp(q[0], p[0], u), lerp(q[1], p[1], u), p[2], p[3], p[4], p[5]]; });
    if (Math.abs(a.b[0] - b.b[0]) < 8 && Math.abs(a.b[1] - b.b[1]) < 8) o.b = [lerp(a.b[0], b.b[0], u), lerp(a.b[1], b.b[1], u), lerp(a.b[2], b.b[2], u), b.b[3], b.b[4]];
    return o;
  }

  return { draw, camera, lerpSnap, mmss, yardText, bannerBox, ROLE_NAME };
})();
