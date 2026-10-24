/* ==========================================================================
   ATARI FOOTBALL — plays.js
   The playbook. All positions are [f, l] relative to the snap:
     f = yards downfield from the line of scrimmage (negative = backfield)
     l = yards to the OFFENSE'S LEFT of the ball (negative = right)
   so every play works in both directions and from either hash.

   Offense roles (7):  C  LG  RG  QB  RB  WR1 (split left)  WR2 (split right)
   Defense roles (7):  LE  NT  RE  MLB  CB1 (over WR1)  CB2 (over WR2)  S
   ========================================================================== */
const OFF_ROLES = ['C', 'LG', 'RG', 'QB', 'RB', 'WR1', 'WR2'];
const DEF_ROLES = ['LE', 'NT', 'RE', 'MLB', 'CB1', 'CB2', 'S'];
const OI = Object.fromEntries(OFF_ROLES.map((r, i) => [r, i]));
const DI = Object.fromEntries(DEF_ROLES.map((r, i) => [r, i]));

const BASE_OFF = { C: [-0.6, 0], LG: [-0.8, 1.6], RG: [-0.8, -1.6], QB: [-1.7, 0], RB: [-5, 0], WR1: [-0.8, 13], WR2: [-0.8, -13] };
const BASE_DEF = { LE: [1.1, 2.7], NT: [1.1, 0], RE: [1.1, -2.7], MLB: [4.5, 0], CB1: [6, 13], CB2: [6, -13], S: [13, 0] };

/* Offensive plays.
   kind: run | pass | punt | fg
   routes: waypoint lists per role ([f,l] points, run in order)
   block: 'run' | 'pass' | 'screen' (offensive line behaviour), side: play side (+1 left / -1 right)
   carrier: who gets the ball on a run; handoff: seconds after snap; pitch: QB pitches with ACTION
   primary: first read for the QB; fake: play-action (defenders bite)
   wrBlock: receivers block after their stem on runs */
const OFFENSE = [
  { id: 'runl', name: 'RUN LEFT', kind: 'run', desc: 'HANDOFF. RB HITS THE LEFT GUARD HOLE.', block: 'run', side: 1, carrier: 'RB', handoff: 0.32,
    routes: { QB: [[-2.2, -0.6], [-3, -2]], RB: [[-3.2, 1.0], [0.5, 2.6], [6, 3.2]], WR1: [[4, 12]], WR2: [[7, -11]] }, wrBlock: true },
  { id: 'runr', name: 'RUN RIGHT', kind: 'run', desc: 'HANDOFF. RB HITS THE RIGHT GUARD HOLE.', block: 'run', side: -1, carrier: 'RB', handoff: 0.32,
    routes: { QB: [[-2.2, 0.6], [-3, 2]], RB: [[-3.2, -1.0], [0.5, -2.6], [6, -3.2]], WR1: [[7, 11]], WR2: [[4, -12]] }, wrBlock: true },
  { id: 'sweep', name: 'SWEEP', kind: 'run', desc: 'QB PITCHES (ACTION) TO RB RACING WIDE LEFT.', block: 'run', side: 1, carrier: 'RB', pitch: true,
    routes: { QB: [[-2.5, 1.2]], RB: [[-4.6, 4], [-2.6, 9], [1.5, 12], [8, 13]], WR1: [[2.5, 11]], WR2: [[8, -12]] }, wrBlock: true },
  { id: 'draw', name: 'DRAW', kind: 'run', desc: 'LOOKS LIKE A PASS, THEN A LATE HANDOFF UP THE MIDDLE.', block: 'pass', runAfter: 0.7, side: 0, carrier: 'RB', handoff: 0.72,
    routes: { QB: [[-3.4, 0]], RB: [[-4.6, -0.5], [-4.2, -0.4], [1, 0], [8, -0.5]], WR1: [[9, 13], [18, 13]], WR2: [[9, -13], [18, -13]] } },
  { id: 'qbkeep', name: 'QB KEEPER', kind: 'run', desc: 'QB KEEPS AND RUNS LEFT BEHIND A LEAD BLOCKER.', block: 'run', side: 1, carrier: 'QB',
    routes: { QB: [[-1.6, 2.2], [0, 6], [4, 9]], RB: [[-2.4, 3.6], [1, 7], [5, 9]], WR1: [[3, 10]], WR2: [[8, -10]] }, wrBlock: true, rbBlock: true },
  { id: 'short', name: 'SHORT PASS', kind: 'pass', desc: 'QUICK 3-STEP. WR1 SLANT, WR2 OUT, RB SWING.', block: 'pass', primary: 'WR1',
    routes: { QB: [[-3.6, 0]], WR1: [[3, 12.5], [7.5, 7.5], [12, 4]], WR2: [[6, -12.5], [6.5, -19]], RB: [[-3.5, -3], [0, -8], [3, -10]] } },
  { id: 'deep', name: 'DEEP PASS', kind: 'pass', desc: 'BOMBS AWAY. WR1 STREAK, WR2 POST, RB BLOCKS.', block: 'pass', primary: 'WR1',
    routes: { QB: [[-6.2, 0]], WR1: [[5, 13], [45, 13]], WR2: [[11, -12.5], [32, -3]], RB: [[-3.5, 0.8]] }, rbBlock: true },
  { id: 'cross', name: 'CROSSING', kind: 'pass', desc: 'WRS CROSS UNDERNEATH AT 7 YDS. RB CHECKDOWN.', block: 'pass', primary: 'WR2',
    routes: { QB: [[-4.8, 0]], WR1: [[6, 12], [7, -14]], WR2: [[9, -12], [10, 14]], RB: [[-3.5, 3], [2, 4]] } },
  { id: 'screen', name: 'SCREEN', kind: 'pass', desc: 'LET THEM RUSH. DUMP TO RB BEHIND A WALL ON THE RIGHT.', block: 'screen', side: -1, primary: 'RB',
    routes: { QB: [[-6.5, 0.5], [-7.5, 1.2]], RB: [[-3, -1.2], [-2.6, -6.5], [-2.2, -8]], WR1: [[18, 13]], WR2: [[16, -13], [22, -13]] } },
  { id: 'pa', name: 'PLAY ACTION', kind: 'pass', desc: 'FAKE THE RUN, THEN GO DEEP. LBS AND SAFETY BITE.', block: 'pass', primary: 'WR1', fake: true,
    routes: { QB: [[-2.6, -0.9], [-6.2, 1]], RB: [[-2.6, -1.2], [1, -1.6]], WR1: [[11, 12.5], [21, -2]], WR2: [[12, -12.5], [24, -20]] }, rbBlock: true },
  { id: 'punt', name: 'PUNT', kind: 'punt', desc: '4TH DOWN SPECIAL. BOOT IT AWAY AND COVER.', block: 'pass',
    form: { QB: [-12, 0], RB: [-5, 0.8], WR1: [-0.8, 17], WR2: [-0.8, -17] }, routes: {} },
  { id: 'fg', name: 'FIELD GOAL', kind: 'fg', desc: '3 POINTS. TIME THE KICK METER WITH ACTION.', block: 'pass',
    form: { QB: [-7, 0], RB: [-9.5, 2.2], WR1: [-0.8, 3.4], WR2: [-0.8, -3.4] }, routes: {} },
];

/* Defensive plays. Assignments per role:
   rush | man:<role> | zone:[f,l,r] | deep:[f,l,r] | contain:<side> | spy | fill */
const DEFENSE = [
  { id: 'man', name: 'MAN COVER', desc: 'CORNERS LOCK ON. MLB TAKES THE RB. SAFETY DEEP.',
    as: { LE: 'rush', NT: 'rush', RE: 'rush', MLB: 'man:RB', CB1: 'man:WR1', CB2: 'man:WR2', S: { t: 'deep', f: 16, l: 0, r: 16 } } },
  { id: 'zone', name: 'ZONE COVER', desc: 'EVERYONE GUARDS AN AREA. GREAT VS SHORT PASSES.',
    as: { LE: 'rush', NT: 'rush', RE: 'rush', MLB: { t: 'zone', f: 7, l: 0, r: 8 }, CB1: { t: 'zone', f: 6, l: 12, r: 8 }, CB2: { t: 'zone', f: 6, l: -12, r: 8 }, S: { t: 'deep', f: 17, l: 0, r: 16 } } },
  { id: 'blitz', name: 'BLITZ', desc: 'SEND 5. PRESSURE THE QB. RISKY IF THEY GET IT OFF.', form: { MLB: [2.8, 1.5], S: [6.5, -2] },
    as: { LE: 'rush', NT: 'rush', RE: 'rush', MLB: 'rush', CB1: 'man:WR1', CB2: 'man:WR2', S: 'rush' } },
  { id: 'stuff', name: 'RUN STUFF', desc: 'CROWD THE LINE. STOPS RUNS, BEATABLE DEEP.', form: { MLB: [2.8, 0], CB1: [2.5, 12.5], CB2: [2.5, -12.5], S: [5.5, 0] },
    as: { LE: 'rush', NT: 'rush', RE: 'rush', MLB: 'fill', CB1: 'man:WR1', CB2: 'man:WR2', S: 'fill' } },
  { id: 'contain', name: 'CONTAIN', desc: 'ENDS HOLD THE EDGES, MLB SPIES. STOPS SWEEPS & SCRAMBLES.',
    as: { LE: 'contain:1', NT: 'rush', RE: 'contain:-1', MLB: 'spy', CB1: 'man:WR1', CB2: 'man:WR2', S: { t: 'deep', f: 15, l: 0, r: 16 } } },
  { id: 'prevent', name: 'PREVENT', desc: 'DROP EVERYONE DEEP. NOTHING LONG GETS THROUGH.', form: { CB1: [10, 13], CB2: [10, -13], S: [19, 0], MLB: [6, 0] },
    as: { LE: 'rush', NT: { t: 'zone', f: 5, l: 0, r: 7 }, RE: 'rush', MLB: { t: 'zone', f: 11, l: 0, r: 10 }, CB1: { t: 'deep', f: 19, l: 12, r: 12 }, CB2: { t: 'deep', f: 19, l: -12, r: 12 }, S: { t: 'deep', f: 27, l: 0, r: 16 } } },
];
const PLAY_BY_ID = Object.fromEntries([...OFFENSE, ...DEFENSE].map(p => [p.id, p]));

/** parse an assignment into an object */
function parseAssign(a) {
  if (typeof a === 'object') return a;
  if (a === 'rush' || a === 'spy' || a === 'fill') return { t: a };
  const [t, v] = a.split(':');
  if (t === 'man') return { t: 'man', who: v };
  if (t === 'contain') return { t: 'contain', side: +v };
  return { t: 'rush' };
}

/* ---------------- playbook diagrams (drawn on the select overlay) ----------------
   Offense always drawn attacking UP the diagram, like a coach's playbook card. */
const Diagram = {
  draw(ctx, play, isOff, x, y, w, h, color, oppColor) {
    Px.rect(ctx, x, y, w, h, '#123d18'); Px.frame(ctx, x, y, w, h, '#58c060');
    const S = 4.2;                               // px per yard in the diagram
    const losY = y + h - 58, cx = x + Math.floor(w / 2);
    const P = (f, l) => [Math.round(cx - l * S), Math.round(losY - f * S)];
    // yard lines
    for (let f = -10; f <= 40; f += 5) { const py = P(f, 0)[1]; if (py > y + 2 && py < y + h - 2) Px.line(ctx, x + 2, py, x + w - 3, py, '#1d5a24', f === 0 ? null : [2, 3]); }
    Px.line(ctx, x + 2, losY, x + w - 3, losY, '#58a0ff');
    const ring = (ctx, px, py, c) => { Px.rect(ctx, px - 1, py - 2, 3, 1, c); Px.rect(ctx, px - 1, py + 2, 3, 1, c); Px.rect(ctx, px - 2, py - 1, 1, 3, c); Px.rect(ctx, px + 2, py - 1, 1, 3, c); };
    const cross = (ctx, px, py, c) => { Px.line(ctx, px - 2, py - 2, px + 2, py + 2, c); Px.line(ctx, px - 2, py + 2, px + 2, py - 2, c); };
    const clip = ([px, py]) => [clamp(px, x + 3, x + w - 4), clamp(py, y + 3, y + h - 4)];
    if (isOff) {
      const form = Object.assign({}, BASE_OFF, play.form || {});
      // defense ghosts (base) for context
      for (const r of DEF_ROLES) { const [px, py] = clip(P(...BASE_DEF[r])); cross(ctx, px, py, '#2f7a38'); }
      for (const r of OFF_ROLES) {
        const start = form[r], pts = (play.routes && play.routes[r]) || [];
        let [px, py] = clip(P(...start));
        let lx = px, ly = py;
        const isBall = (play.carrier === r) || (play.kind === 'pass' && r === play.primary);
        const rc = isBall ? '#ffffff' : color;
        for (let k = 0; k < pts.length; k++) {
          const [nx, ny] = clip(P(...pts[k]));
          Px.line(ctx, lx, ly, nx, ny, rc, r === 'QB' ? [1, 2] : null);
          if (k === pts.length - 1) {
            if ((play.wrBlock && r.startsWith('WR')) || (play.rbBlock && r === 'RB') ) Px.rect(ctx, nx - 2, ny - 1, 5, 1, rc); // block "T"
            else Px.arrow(ctx, lx, ly, nx, ny, rc);
          }
          lx = nx; ly = ny;
        }
        ring(ctx, px, py, color);
      }
      if (play.kind === 'punt' || play.kind === 'fg') {
        const [qx, qy] = P(...form.QB), t = play.kind === 'punt' ? P(38, 0) : P(14, 0);
        Px.line(ctx, qx, qy - 3, t[0], Math.max(y + 4, t[1]), '#ffe048', [2, 2]);
      }
    } else {
      const form = Object.assign({}, BASE_DEF, play.form || {});
      for (const r of OFF_ROLES) { const [px, py] = clip(P(...BASE_OFF[r])); ring(ctx, px, py, '#2f7a38'); }
      for (const r of DEF_ROLES) {
        const a = parseAssign(play.as[r]), [px, py] = clip(P(...form[r]));
        if (a.t === 'rush') { const [qx, qy] = P(-4, (form[r][1]) * 0.3); Px.line(ctx, px, py, qx, qy, color); Px.arrow(ctx, px, py, qx, qy, color); }
        else if (a.t === 'contain') { const [qx, qy] = P(-3, a.side * 6); Px.line(ctx, px, py, qx, qy, color); Px.arrow(ctx, px, py, qx, qy, color); }
        else if (a.t === 'fill') { const [qx, qy] = P(0.5, form[r][1] * 0.5); Px.line(ctx, px, py, qx, qy, color); Px.arrow(ctx, px, py, qx, qy, color); }
        else if (a.t === 'spy') { const [qx, qy] = P(-1.5, 0); Px.line(ctx, px, py, qx, qy, color, [1, 2]); }
        else if (a.t === 'man') { const tgt = BASE_OFF[a.who]; const [qx, qy] = clip(P(tgt[0] + 6, tgt[1])); Px.line(ctx, px, py, qx, qy, color, [3, 2]); Px.arrow(ctx, px, py, qx, qy, color); }
        else if (a.t === 'zone' || a.t === 'deep') { const [zx, zy] = clip(P(a.f, a.l)); Px.line(ctx, px, py, zx, zy, color, [1, 1]); Px.circle(ctx, zx, zy, Math.round(a.r * S * 0.55), color, true); }
        cross(ctx, px, py, color);
      }
    }
  },
};
