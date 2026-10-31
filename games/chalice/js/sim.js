/* CHALICE — sim.js : the rules. Deterministic (seeded) at a fixed 60 Hz so a scripted bot can
   play-test every level in node, and the same code drives the browser game.
   Units are tiles. Everything lives in global tile coordinates (see world.js). */
(function (root) {
  'use strict';
  const World = (typeof module !== 'undefined' && module.exports) ? require('./world.js') : root.ChaliceWorld;
  const { RW, RH, T } = World;

  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hyp = Math.hypot;

  const ITEM_SIZE = { sword: [1.5, 0.5], key: [1.05, 0.55], chalice: [0.85, 0.95], magnet: [0.85, 0.85], bridge: [4.6, 1.6], dot: [0.34, 0.34], lantern: [0.6, 0.95] };
  const ITEM_NAME = { sword: 'the Sword', gold: 'the Gold Key', black: 'the Black Key', white: 'the White Key', chalice: 'the Chalice', magnet: 'the Magnet', bridge: 'the Bridge', dot: 'a strange grey Dot', lantern: 'the Lantern' };
  const DRAGONS = {
    yellow: { name: 'Yorgrim', title: 'the Yellow Dragon', speed: 3.3, aggro: 9, giveUp: 7, bite: 0.55, fears: 'gold' },
    green: { name: 'Grumbald', title: 'the Green Dragon', speed: 3.6, aggro: 11, giveUp: 11, bite: 0.5, fears: null },
    red: { name: 'Rhindra', title: 'the Red Dragon', speed: 5.0, aggro: 16, giveUp: 0, bite: 0.42, fears: null },
  };
  // fixed layouts. [kind, colour/id, room, localX, localY]
  const LAYOUT = {
    1: { items: [['sword', 'sword', 'gold_castle', 5, 9], ['key', 'gold', 'southmeadow', 16, 5.5], ['key', 'black', 'lab_n', 17.5, 1.5], ['chalice', 'chalice', 'black_inner', 10, 4.5]],
      dragons: [['yellow', 'lab_c', 6.5, 5.5, 'black'], ['green', 'black_inner', 10, 7, 'chalice']], bat: false, goldLocked: true },
    2: { items: [['sword', 'sword', 'gold_inner', 10, 5], ['key', 'gold', 'kingsroad', 14.5, 8.5], ['key', 'white', 'lab_n', 17.5, 1.5], ['key', 'black', 'white_inner', 10, 5.5],
      ['chalice', 'chalice', 'black_inner', 10, 4.5], ['magnet', 'magnet', 'riverbank', 16.5, 5.5], ['bridge', 'bridge', 'mistwood', 9, 5.5], ['dot', 'dot', 'black_deep', 17.5, 1.6]],
      dragons: [['yellow', 'kingsroad', 4, 6, 'gold'], ['green', 'white_castle', 10, 9, 'black'], ['red', 'black_inner', 10, 7, 'chalice']], bat: ['southmeadow', 10, 9] },
  };
  LAYOUT[3] = { items: LAYOUT[2].items, dragons: LAYOUT[2].dragons, bat: LAYOUT[2].bat, random: true };
  LAYOUT[4] = { items: LAYOUT[2].items.concat([['lantern', 'lantern', 'lakeshore', 14, 8]]), dragons: LAYOUT[2].dragons, bat: LAYOUT[2].bat, random: true, fixed: { chalice: ['jade_inner', 10, 4.5], dot: true } };

  function create(opts) {
    opts = opts || {};
    const level = opts.level || 1, seed = (opts.seed == null ? 1 : opts.seed) >>> 0;
    const rand = rng(seed * 2654435761 + level * 97 + 7);
    const w = World.build(level);
    const S = {
      level, seed, w, rand, time: 0, ticks: 0, started: false, won: false, wonT: 0, deaths: 0, slain: 0, steals: 0,
      diffL: opts.diffL || 'B', diffR: opts.diffR || 'B', events: [], visited: {}, seen: {}, makersFound: false,
      items: [], dragons: [], bat: null, tutorial: !!opts.tutorial, msg: null,
    };
    const W = w.W, H = w.H, tiles = w.tiles;
    const room = (x, y) => w.roomAt(Math.floor(x), Math.floor(y));
    const ev = (type, x, y, extra) => { const e = Object.assign({ type, x, y }, extra || {}); S.events.push(e); return e; };

    /* ---------------- items ---------------- */
    const L = LAYOUT[level];
    for (const [kind, id, rid, lx, ly] of L.items) {
      const r = w.rooms[rid]; if (!r) continue;
      const [iw, ih] = ITEM_SIZE[kind];
      S.items.push({ id, kind, x: r.x0 + lx, y: r.y0 + ly, w: iw, h: ih, holder: null, ang: 0, vx: 0, vy: 0, t: rand() * 10 });
    }
    const item = id => S.items.find(i => i.id === id);
    S.item = item;

    /* ---------------- passability ---------------- */
    const gateAt = i => w.gates.find(g => g.cells.includes(i));
    const gateCell = new Map(); for (const g of w.gates) for (const c of g.cells) gateCell.set(c, g);
    const dotLive = () => { const d = item('dot'); if (!d) return false; if (d.holder === 'player') return true; const r = room(d.x, d.y); return !!r && (r.id === 'black_deep' || r.id === 'makers'); };
    function bridgeCovers(x, y) {
      const b = item('bridge'); if (!b || b.holder) return false;
      return Math.abs(x - b.x) < b.w / 2 - 0.55 && Math.abs(y - b.y) < b.h / 2 - 0.15;
    }
    // player passability of tile (tx,ty)
    function solidP(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
      const i = ty * W + tx, t = tiles[i];
      if (t === T.FLOOR) return false;
      if (t === T.GATE) { const g = gateCell.get(i); return !(g && g.t > 0.85); }
      if (t === T.BARRIER) return !dotLive();
      if (t === T.CASTLE) return true;
      if (!w.roomAt(tx, ty)) return true;
      return !bridgeCovers(tx + 0.5, ty + 0.5);
    }
    // creature (dragon) passability
    function passD(i) { const t = tiles[i]; if (t === T.FLOOR) return true; if (t === T.GATE) { const g = gateCell.get(i); return !!(g && g.open); } return false; }
    S.solidP = solidP; S.passD = passD;

    /* ---------------- level 3/4: shuffle the treasure, keep it winnable ---------------- */
    function reachSet(gOpen, blockGates) {
      // flood from the start over floor + open gates (no bridge, no barrier)
      const seen = new Uint8Array(W * H); const s = w.rooms.gold_castle; const st = [(s.y0 + 8) * W + s.x0 + 10]; seen[st[0]] = 1;
      while (st.length) { const i = st.pop(); const x = i % W;
        for (const j of [i + 1, i - 1, i + W, i - W]) { if (seen[j]) continue; if (Math.abs((j % W) - x) > 1) continue; const t = tiles[j];
          const ok = t === T.FLOOR || (t === T.GATE && gOpen[gateCell.get(j).key]); if (ok) { seen[j] = 1; st.push(j); } } }
      return seen;
    }
    function solvable() {
      const open = {}; for (const g of w.gates) open[g.key] = false;
      const at = it => Math.floor(it.y) * W + Math.floor(it.x);
      for (let pass = 0; pass < 8; pass++) {
        const R = reachSet(open); let changed = false;
        for (const g of w.gates) {
          if (open[g.key]) continue;
          if (g.key === 'jade') { if (['gold', 'black', 'white'].every(k => item(k) && R[at(item(k))])) { open.jade = true; changed = true; } }
          else { const k = item(g.key); if (k && R[at(k)]) { open[g.key] = true; changed = true; } }
        }
        if (!changed) { const c = item('chalice'); return !!(c && R[at(c)] && open.gold); }
      }
      return false;
    }
    S.solvable = solvable;
    if (L.random) {
      const base = reachSet(Object.fromEntries(w.gates.map(g => [g.key, true])));
      const cands = [];
      for (const id in w.rooms) {
        const r = w.rooms[id]; if (id === 'makers' || id === 'jade_inner') continue;
        for (let y = 2; y < RH - 2; y++) for (let x = 2; x < RW - 2; x++) {
          const i = (r.y0 + y) * W + r.x0 + x; if (!base[i]) continue;
          if (r.kind === 'castle' && y < 7) continue;
          let clear = true; for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1; dx++) if (tiles[i + dy * W + dx] !== T.FLOOR) { clear = false; break; }
          if (clear) cands.push({ x: r.x0 + x + 0.5, y: r.y0 + y + 0.5, room: id });
        }
      }
      const movable = S.items.filter(it => it.kind !== 'dot' && !(L.fixed && L.fixed[it.id]));
      const fx = L.fixed && L.fixed.chalice; if (fx) { const c = item('chalice'), r = w.rooms[fx[0]]; c.x = r.x0 + fx[1]; c.y = r.y0 + fx[2]; }
      let tries = 0;
      do {
        const used = [];
        for (const it of movable) {
          let p, n = 0;
          do { p = cands[(rand() * cands.length) | 0]; n++; }
          while (n < 200 && (used.some(u => hyp(u.x - p.x, u.y - p.y) < 4) || (it.kind === 'chalice' && (p.room === 'gold_inner' || p.room === 'gold_castle'))
            || (it.kind === 'bridge' && (w.rooms[p.room].kind !== 'meadow' && w.rooms[p.room].kind !== 'forest'))));
          used.push(p); it.x = p.x; it.y = p.y;
        }
        tries++;
      } while (!solvable() && tries < 400);
      S.shuffleTries = tries;
    }

    /* ---------------- player ---------------- */
    const start = w.rooms.gold_castle;
    const P = S.player = { x: start.x0 + 10, y: start.y0 + 9, w: 0.8, h: 0.8, vx: 0, vy: 0, fx: 0, fy: 1, held: null, dead: false, eater: null,
      ignore: null, ignoreT: 0, invuln: 0, flareCD: 0, flareT: 0, step: 0, moving: false };

    /* ---------------- dragons ---------------- */
    for (const [id, rid, lx, ly, guard] of L.dragons) {
      const r = w.rooms[rid]; const d = DRAGONS[id];
      S.dragons.push({ id, name: d.name, title: d.title, x: r.x0 + lx, y: r.y0 + ly, homeX: r.x0 + lx, homeY: r.y0 + ly, alive: true, state: 'guard',
        speed: d.speed * (level === 4 ? 1.08 : 1), aggro: d.aggro, giveUp: d.giveUp, biteDelay: opts.diffL === 'A' ? 0.2 : d.bite, fears: d.fears, guard,
        tx: null, ty: null, t: 0, chaseT: 0, cool: 0, stun: 0, face: 1, vx: 0, vy: 0, dieT: 0, mood: 0, hes: 0, anim: rand() * 10, gField: null, gFieldT: 0, gKey: -1 });
    }
    if (L.bat) { const r = w.rooms[L.bat[0]]; S.bat = { x: r.x0 + L.bat[1], y: r.y0 + L.bat[2], vx: 0, vy: 0, held: null, state: 'roam', t: 0, tgt: null, covet: 9, cool: 0, anim: 0, wob: rand() * 6 }; }
    const g0 = w.gates.find(g => g.key === 'gold'); if (g0) g0.open = false;

    /* ---------------- fields (BFS) ---------------- */
    const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    function field(sx, sy, maxD) {
      const dist = new Int16Array(W * H).fill(-1); const q = new Int32Array(W * H); let h = 0, t = 0;
      const s = Math.floor(sy) * W + Math.floor(sx); if (s < 0 || s >= W * H) return dist; dist[s] = 0; q[t++] = s;
      while (h < t) { const i = q[h++]; const d = dist[i]; if (maxD && d >= maxD) continue; const x = i % W;
        for (let k = 0; k < 4; k++) { const [dx, dy] = N8[k]; const nx = x + dx; if (nx < 0 || nx >= W) continue; const j = i + dy * W + dx; if (j < 0 || j >= W * H || dist[j] >= 0) continue;
          if (!passD(j) && j !== s) continue; dist[j] = d + 1; q[t++] = j; } }
      return dist;
    }
    S.field = field;
    let pField = null, pFieldT = 0;
    function nextTile(d, f, flee) {
      // choose the neighbour tile (8-way, no corner cutting) that lowers (or raises) the field value
      const cx = Math.floor(d.x), cy = Math.floor(d.y), ci = cy * W + cx; const cur = f[ci];
      let best = null, bv = flee ? (cur < 0 ? -1 : cur) : (cur < 0 ? 1e9 : cur);
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy; const j = ny * W + nx; if (!passD(j)) continue;
        if (dx && dy && (!passD(cy * W + nx) || !passD(ny * W + cx))) continue;
        const v = f[j]; if (v < 0) continue;
        const better = flee ? v > bv : v < bv;
        if (better || (v === bv && !best && flee)) { bv = v; best = [nx + 0.5, ny + 0.5]; }
      }
      return best;
    }

    function lineD(x0, y0, x1, y1) { const n = Math.ceil(hyp(x1 - x0, y1 - y0) / 0.3) + 1; for (let k = 0; k <= n; k++) { if (!passD(Math.floor(y0 + (y1 - y0) * k / n) * W + Math.floor(x0 + (x1 - x0) * k / n))) return false; } return true; }
    /* ---------------- helpers ---------------- */
    const overlap = (a, ax, ay, b, bx, by) => Math.abs(ax - bx) * 2 < a.w + b.w && Math.abs(ay - by) * 2 < a.h + b.h;
    const DBOX = { w: 1.25, h: 1.5 };
    function heldPos(it) {
      let fx = P.fx, fy = P.fy; const m = hyp(fx, fy) || 1; fx /= m; fy /= m;
      let reach;
      if (it.kind === 'sword') reach = 0.4 + it.w / 2 + 0.05;
      else reach = 0.42 + Math.abs(fx) * it.w / 2 + Math.abs(fy) * it.h / 2 + 0.06;
      return [P.x + fx * reach, P.y + fy * reach, Math.atan2(fy, fx)];
    }
    function swordPoints(s) {
      const a = s.holder ? s.ang : 0, c = Math.cos(a), si = Math.sin(a), out = [];
      for (const k of [-0.6, -0.2, 0.2, 0.6]) out.push([s.x + c * k * s.w, s.y + si * k * s.w]);
      return out;
    }
    S.swordPoints = swordPoints;
    function inDragon(d, x, y, pad) { return Math.abs(x - d.x) < DBOX.w / 2 + (pad || 0) && Math.abs(y - d.y) < DBOX.h / 2 + (pad || 0); }

    function drop(it, x, y) { it.holder = null; it.x = x; it.y = y; it.ang = 0; }
    function pick(it) {
      if (P.held) { const o = P.held; drop(o, o.x, o.y); P.ignore = o; P.ignoreT = 0.8; ev('drop', o.x, o.y, { item: o.id }); }
      if (it.holder === 'bat' && S.bat) { S.bat.held = null; S.bat.state = 'escape'; S.bat.t = 3; S.bat.covet = 10; ev('snatch', it.x, it.y); }
      it.holder = 'player'; P.held = it; ev('pick', it.x, it.y, { item: it.id });
      if (it.id === 'chalice') ev('chalice', it.x, it.y);
    }
    S.ITEM_NAME = ITEM_NAME;

    /* ---------------- player movement ---------------- */
    function boxFree(x, y, hw, hh) {
      const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-6), y0 = Math.floor(y - hh), y1 = Math.floor(y + hh - 1e-6);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidP(tx, ty)) return false;
      return true;
    }
    S.boxFree = boxFree;
    function movePlayer(mx, my, dt) {
      const m = hyp(mx, my); if (m > 1) { mx /= m; my /= m; }
      const SP = 5.6; const ax = mx * SP, ay = my * SP; const k = 1 - Math.exp(-dt * 18);
      P.vx += (ax - P.vx) * k; P.vy += (ay - P.vy) * k;
      if (Math.abs(P.vx) < 0.01 && !mx) P.vx = 0; if (Math.abs(P.vy) < 0.01 && !my) P.vy = 0;
      if (m > 0.2) { // facing: 8 directions
        const a = Math.round(Math.atan2(my, mx) / (Math.PI / 4)) * (Math.PI / 4); P.fx = Math.round(Math.cos(a) * 1000) / 1000; P.fy = Math.round(Math.sin(a) * 1000) / 1000;
      }
      const hw = P.w / 2, hh = P.h / 2; let dx = P.vx * dt, dy = P.vy * dt;
      if (dx) { if (boxFree(P.x + dx, P.y, hw, hh)) P.x += dx; else {
        // corner assist: slide around a corner if a small vertical nudge frees the way
        let done = false; for (const n of [0.12, 0.24, 0.36, 0.48]) for (const s of [-1, 1]) { if (done) break; if (boxFree(P.x + dx, P.y + s * n, hw, hh) && boxFree(P.x, P.y + s * Math.min(n, 0.12), hw, hh) && !my) { P.y += s * Math.min(n, Math.abs(dx) * 1.2 + 0.02); done = true; } }
        P.vx *= 0.3; } }
      if (dy) { if (boxFree(P.x, P.y + dy, hw, hh)) P.y += dy; else {
        let done = false; for (const n of [0.12, 0.24, 0.36, 0.48]) for (const s of [-1, 1]) { if (done) break; if (boxFree(P.x + s * n, P.y + dy, hw, hh) && boxFree(P.x + s * Math.min(n, 0.12), P.y, hw, hh) && !mx) { P.x += s * Math.min(n, Math.abs(dy) * 1.2 + 0.02); done = true; } }
        P.vy *= 0.3; } }
      P.moving = hyp(P.vx, P.vy) > 0.4; if (P.moving) P.step += dt * hyp(P.vx, P.vy);
    }

    /* ---------------- dragons ---------------- */
    function playerHolds(kind, id) { return P.held && !P.dead && (P.held.kind === kind || P.held.id === id); }
    function updateDragon(d, dt) {
      d.anim += dt;
      if (!d.alive) { d.dieT += dt; return; }
      if (d.stun > 0) { d.stun -= dt; d.vx *= 0.8; d.vy *= 0.8; return; }
      if (d.cool > 0) d.cool -= dt;
      const pd = pField ? pField[Math.floor(d.y) * W + Math.floor(d.x)] : -1;
      const dist = hyp(P.x - d.x, P.y - d.y);
      const pr = room(P.x, P.y), dr = room(d.x, d.y);
      const fearsNow = !P.dead && pd >= 0 && pd < 9 && ((d.fears && playerHolds('key', d.fears)) || (S.diffR === 'A' && playerHolds('sword')));
      if (d.state === 'eat') { d.t -= dt; if (d.t <= 0) { d.state = 'full'; d.t = 6; } return; }
      if (d.state === 'full') { d.t -= dt; if (d.t <= 0) { d.state = 'guard'; d.cool = 2; } }
      else if (d.state === 'bite') {
        d.t -= dt;
        if (d.t <= 0) {
          if (!P.dead && P.invuln <= 0 && inDragon(d, P.x, P.y, 0.45)) {
            P.dead = true; P.eater = d.id; d.state = 'eat'; d.t = 1.3; S.deaths++; P.vx = P.vy = 0;
            if (P.held) { const o = P.held; drop(o, o.x, o.y); P.held = null; }
            ev('eaten', d.x, d.y, { dragon: d.id });
          } else { d.state = 'chase'; ev('snap', d.x, d.y, { dragon: d.id }); }
        }
        return;
      } else if (fearsNow) { if (d.state !== 'flee') ev('flee', d.x, d.y, { dragon: d.id }); d.state = 'flee'; d.t = 1.5; }
      else if (d.state === 'flee') { d.t -= dt; if (d.t <= 0) { d.state = 'guard'; d.cool = 1.5; } }
      else if (d.state === 'chase') {
        d.chaseT += dt;
        const lost = P.dead || pd < 0 || pd > d.aggro * 2.2 || (d.giveUp && d.chaseT > d.giveUp);
        if (lost) { d.state = 'guard'; d.cool = d.id === 'yellow' ? 4 : 3; ev('giveup', d.x, d.y, { dragon: d.id }); }
        else if (d.id === 'red' && d.chaseT > 12) { d.state = 'rest'; d.t = 2.2; ev('pant', d.x, d.y, { dragon: d.id }); }
        else if (!P.dead && P.invuln <= 0 && inDragon(d, P.x, P.y, 0.2)) { d.state = 'bite'; d.t = d.biteDelay; ev('bite', d.x, d.y, { dragon: d.id }); return; }
      } else if (d.state === 'rest') { d.t -= dt; if (d.t <= 0) { d.state = 'chase'; d.chaseT = 0; } }
      if (d.state === 'guard' && d.cool <= 0 && !P.dead && P.invuln <= 0 && pd >= 0 && pd <= d.aggro && (pr === dr || pd <= 4)) {
        d.state = 'chase'; d.chaseT = 0; d.hes = d.id === 'yellow' ? 0.5 : d.id === 'green' ? 0.25 : 0.1; ev('roar', d.x, d.y, { dragon: d.id });
      }
      if (d.hes > 0) { d.hes -= dt; return; }
      // movement target
      let spd = d.speed, target = null;
      if (d.state === 'chase') {
        if (pd >= 0 && pd <= 2 && dist < 2.4 && lineD(d.x, d.y, P.x, P.y)) { target = [P.x, P.y]; }
        else if (pField) target = nextTile(d, pField, false);
        if (d.id === 'red' && d.chaseT > 9) spd *= 0.8;
      } else if (d.state === 'flee') { if (pField) target = nextTile(d, pField, true); spd *= 1.05; }
      else if (d.state === 'rest' || d.state === 'full') { spd = 0; }
      else { // guard: hover around the treasure it guards (wherever the treasure now lies), else home
        const g = item(d.guard); let gx = d.homeX, gy = d.homeY;
        if (g && g.holder !== 'bat') { gx = g.holder === 'player' ? P.x : g.x; gy = g.holder === 'player' ? P.y : g.y; }
        d.gFieldT -= dt;
        if (!d.gField || d.gFieldT <= 0) {
          let f = field(gx, gy, 90);
          if (f[Math.floor(d.y) * W + Math.floor(d.x)] < 0) { gx = d.homeX; gy = d.homeY; f = field(gx, gy, 120); }
          d.gField = f; d.gX = gx; d.gY = gy; d.gFieldT = 1.0;
        }
        const h2 = d.gField[Math.floor(d.y) * W + Math.floor(d.x)];
        if (h2 > 3 || h2 < 0) { target = nextTile(d, d.gField, false); spd *= 0.75; }
        else { // patrol a lazy loop around the treasure
          const a = d.anim * (d.id === 'green' ? 0.7 : 0.45); const px = d.gX + Math.cos(a) * 2.2, py = d.gY + Math.sin(a) * 1.4;
          if (lineD(d.x, d.y, px, py)) { target = [px, py]; d.tx = px; d.ty = py; } else target = nextTile(d, d.gField, false);
          spd *= 0.4;
        }
      }
      if (target) {
        if (d.tx == null || hyp(d.tx - d.x, d.ty - d.y) < 0.08 || d.state === 'chase' && pd <= 2) { d.tx = target[0]; d.ty = target[1]; }
        let ddx = d.tx - d.x, ddy = d.ty - d.y; const m = hyp(ddx, ddy);
        if (m > 1e-3) { const st = Math.min(m, spd * dt); ddx /= m; ddy /= m; d.vx = ddx * spd; d.vy = ddy * spd; d.x += ddx * st; d.y += ddy * st; if (Math.abs(ddx) > 0.2) d.face = ddx > 0 ? 1 : -1; }
        else { d.vx = d.vy = 0; d.tx = null; }
      } else { d.vx *= 0.8; d.vy *= 0.8; d.tx = null; }
    }

    /* ---------------- the bat ---------------- */
    const presentRooms = Object.values(w.rooms).filter(r => r.id !== 'makers');
    function randomPoint(far) {
      for (let n = 0; n < 40; n++) {
        const r = presentRooms[(rand() * presentRooms.length) | 0];
        const x = r.x0 + 2 + rand() * (RW - 4), y = r.y0 + 2 + rand() * (RH - 4);
        if (far && hyp(x - P.x, y - P.y) < far) continue;
        if (!far && rand() < 0.5 && hyp(x - P.x, y - P.y) > 28) continue;
        return [x, y];
      }
      return [P.x, P.y];
    }
    // the Jade Reliquary is warded: the bat cannot reach in while its gate is shut
    function warded(it) { if (it.kind === 'key' && !it.holder && w.pedestals.some(p => hyp(it.x - p.x, it.y - p.y) < 1.0)) return true; const r = room(it.x, it.y); if (!r || r.id !== 'jade_inner' || it.holder === 'player') return false; const g = w.gates.find(g => g.key === 'jade'); return !(g && g.open); }
    S.warded = warded;
    // the bat only ever lets go of things over open ground you can walk to
    const openReach = reachSet(Object.fromEntries(w.gates.map(g => [g.key, true])));
    function safeSpot(x, y) {
      const cx = Math.floor(x), cy = Math.floor(y);
      for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const tx = cx + dx, ty = cy + dy; if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) continue;
        const rr = w.roomAt(tx, ty); if (!rr || rr.id === 'makers' || rr.id === 'jade_inner') continue;
        if (openReach[ty * W + tx]) return [tx + 0.5, ty + 0.5];
      }
      return [start.x0 + 10, start.y0 + 9];
    }
    function batLetGo(B) { const o = B.held; if (!o) return; B.held = null; const [x, y] = safeSpot(B.x, B.y + 0.6); drop(o, x, y); ev('batdrop', B.x, B.y, { item: o.id, x, y }); }
    S.safeSpot = safeSpot;
    function updateBat(B, dt) {
      B.anim += dt; B.wob += dt;
      if (B.cool > 0) B.cool -= dt; if (B.sated > 0) B.sated -= dt;
      let tx, ty, spd = 6.2;
      const dP = hyp(P.x - B.x, P.y - B.y);
      if (B.state === 'roam') {
        B.covet -= dt;
        if (!B.tgt || hyp(B.tgt[0] - B.x, B.tgt[1] - B.y) < 1) B.tgt = randomPoint(0);
        [tx, ty] = B.tgt; spd = 4.2;
        if (B.covet <= 0) {
          // pick something to steal: it loves whatever you are carrying, the Chalice and the Sword
          const opts2 = S.items.filter(i => i.kind !== 'dot' && i.kind !== 'bridge' && i.holder !== 'bat' && !warded(i));
          let best = null, bw = -1;
          for (const it of opts2) {
            const ix = it.holder === 'player' ? P.x : it.x, iy = it.holder === 'player' ? P.y : it.y; const d = hyp(ix - B.x, iy - B.y);
            let wt = (it.holder === 'player' ? 3.2 : 1) * (it.kind === 'chalice' ? 2.2 : it.kind === 'sword' ? 1.6 : it.kind === 'key' ? 1.3 : 1) / (1 + d / 18);
            wt *= 0.6 + rand() * 0.8; if ((P.dead || B.sated > 0) && it.holder === 'player') wt = 0;
            if (wt > bw) { bw = wt; best = it; }
          }
          if (best) { B.state = 'seek'; B.target = best; B.t = 22; ev('bat', B.x, B.y); }
          else B.covet = 6;
        }
      } else if (B.state === 'seek') {
        const it = B.target; B.t -= dt;
        if (!it || it.holder === 'bat' || B.t <= 0 || warded(it)) { B.state = 'roam'; B.covet = 5; }
        else {
          if (it.holder === 'player') { tx = P.x + P.vx * 0.55; ty = P.y + P.vy * 0.55; spd = 6.6; } else { tx = it.x; ty = it.y; spd = 6.0; }
          if (hyp(it.x - B.x, it.y - B.y) < 0.95 && (it.holder !== 'player' || P.invuln <= 0)) {
            if (B.held) batLetGo(B);
            if (it.holder === 'player') { P.held = null; S.steals++; B.sated = 30; ev('steal', B.x, B.y, { item: it.id }); } else ev('batgrab', B.x, B.y, { item: it.id });
            it.holder = 'bat'; B.held = it; B.state = 'escape'; B.t = 7 + rand() * 6; B.tgt = randomPoint(26);
          }
        }
      } else if (B.state === 'escape') {
        B.t -= dt; if (!B.tgt) B.tgt = randomPoint(26); [tx, ty] = B.tgt; spd = 6.4;
        if (hyp(B.tgt[0] - B.x, B.tgt[1] - B.y) < 1) B.tgt = randomPoint(18);
        if (B.t <= 0) { B.state = 'roam'; B.covet = 8 + rand() * 7; B.tgt = null; }
      }
      // evade: a bat with loot veers away from an approaching hero
      if (B.held && dP < 2.6 && !P.dead) { const ex = (B.x - P.x) / (dP || 1), ey = (B.y - P.y) / (dP || 1); tx = B.x + ex * 4; ty = B.y + ey * 4; spd = 4.6; }
      // a bat that has carried its loot for a long while gets bored and lets it fall
      if (B.held) { B.carry = (B.carry || 0) + dt; if (B.carry > 24) { batLetGo(B); B.carry = 0; B.state = 'roam'; B.covet = 10; } } else B.carry = 0;
      if (tx != null) {
        let dx = tx - B.x, dy = ty - B.y; const m = hyp(dx, dy) || 1; dx /= m; dy /= m;
        const wob = Math.sin(B.wob * 5.3) * 0.55; const ax = (dx - dy * wob) * spd, ay = (dy + dx * wob) * spd;
        const k = 1 - Math.exp(-dt * 3.2); B.vx += (ax - B.vx) * k; B.vy += (ay - B.vy) * k;
      }
      B.x = clamp(B.x + B.vx * dt, 1, W - 1); B.y = clamp(B.y + B.vy * dt, 1, H - 1);
      if (B.held) { B.held.x = B.x; B.held.y = B.y + 0.75; }
    }

    /* ---------------- the step ---------------- */
    S.step = function (inp, dt) {
      dt = dt || 1 / 60; inp = inp || {};
      S.events.length = 0; S.ticks++;
      if (S.won) { S.wonT += dt; return S.events; }
      let mx = inp.mx || 0, my = inp.my || 0;
      if (!S.started && (Math.abs(mx) > 0.1 || Math.abs(my) > 0.1 || inp.drop || inp.flare)) { S.started = true; ev('start', P.x, P.y); }
      if (S.started) S.time += dt;
      if (P.dead) {
        if (inp.drop) { // rise again at the gold castle
          P.dead = false; P.eater = null; P.x = start.x0 + 10; P.y = start.y0 + 9; P.vx = P.vy = 0; P.invuln = 2; P.fx = 0; P.fy = 1;
          for (const d of S.dragons) if (d.alive && room(d.x, d.y) === start) { d.state = 'guard'; d.cool = 4; }
          ev('reborn', P.x, P.y);
        }
        mx = my = 0;
      }
      if (P.invuln > 0) P.invuln -= dt;
      if (P.flareCD > 0) P.flareCD -= dt; if (P.flareT > 0) P.flareT -= dt;
      if (P.ignoreT > 0) { P.ignoreT -= dt; if (P.ignoreT <= 0) P.ignore = null; }
      if (!P.dead) {
        movePlayer(mx, my, dt);
        // SPACE: drop (or swap with the thing you are touching)
        if (inp.drop) {
          let touching = null; for (const it of S.items) if (it !== P.held && !it.holder && touchable(it)) { touching = it; break; }
          if (touching) pick(touching);
          else if (P.held) { const o = P.held; P.held = null; drop(o, o.x, o.y); P.ignore = o; P.ignoreT = 0.9; ev('drop', o.x, o.y, { item: o.id }); }
        }
        // ENTER: a flare that dazes dragons and scatters the bat
        if (inp.flare && P.flareCD <= 0) {
          P.flareCD = 10; P.flareT = 1.6; ev('flare', P.x, P.y);
          for (const d of S.dragons) if (d.alive && hyp(d.x - P.x, d.y - P.y) < 7.5 && d.state !== 'eat') { d.stun = 1.7; if (d.state === 'chase' || d.state === 'bite') { d.state = 'guard'; d.cool = 2.5; } ev('daze', d.x, d.y, { dragon: d.id }); }
          const B = S.bat; if (B && hyp(B.x - P.x, B.y - P.y) < 9) { if (B.held) batLetGo(B); B.state = 'escape'; B.t = 5; B.tgt = randomPoint(22); B.covet = 9; }
        }
      }
      // carried item follows the hero
      if (P.held) { const [x, y, a] = heldPos(P.held); P.held.x = x; P.held.y = y; P.held.ang = a; }
      // automatic pick-up when empty-handed
      if (!P.dead && !P.held) {
        for (const it of S.items) { if (it.holder === 'player' || it === P.ignore) continue; if (it.holder === 'bat') { if (S.bat && hyp(S.bat.x - P.x, S.bat.y - P.y) < 1.0) { pick(it); break; } continue; }
          if (touchable(it)) { pick(it); break; } }
      }
      // the magnet pulls the nearest loose thing in its room, straight through walls
      const mg = item('magnet');
      if (mg) {
        const mr = room(mg.x, mg.y); let best = null, bd = 1e9;
        for (const it of S.items) { if (it === mg || it.holder || it.kind === 'bridge') continue; if (room(it.x, it.y) !== mr) continue; const d = hyp(it.x - mg.x, it.y - mg.y); if (d < bd) { bd = d; best = it; } }
        if (best && bd > 1.2) { const k = Math.min(bd - 1.2, 2.4 * dt); best.x += (mg.x - best.x) / bd * k; best.y += (mg.y + 0.0 - best.y) / bd * k; best.pulled = 0.2; }
      }
      // fields
      pFieldT -= dt; if (pFieldT <= 0 || !pField) { pField = P.dead ? null : field(P.x, P.y, 60); pFieldT = 0.1; }
      S.pField = pField;
      for (const d of S.dragons) updateDragon(d, dt);
      if (S.bat) updateBat(S.bat, dt);
      // the sword slays any dragon it touches
      const sw = item('sword');
      if (sw) { const pts = swordPoints(sw); for (const d of S.dragons) { if (!d.alive || d.state === 'eat') continue; if (pts.some(([x, y]) => inDragon(d, x, y, 0))) { d.alive = false; d.dieT = 0; d.state = 'dead'; S.slain++; ev('slay', d.x, d.y, { dragon: d.id }); } } }
      // keys open gates
      for (const g of w.gates) {
        if (!g.open) {
          if (g.key === 'jade') {
            const on = w.pedestals.map(p => S.items.some(it => it.kind === 'key' && !it.holder && hyp(it.x - p.x, it.y - p.y) < 1.0));
            S.pedestalsLit = on;
            if (on.every(Boolean)) { g.open = true; ev('gate', g.x, g.y, { key: g.key }); }
          } else {
            const k = item(g.key);
            if (k && k.holder !== 'bat') for (const c of g.cells) { const cx = c % W + 0.5, cy = Math.floor(c / W) + 0.5; if (Math.abs(k.x - cx) < 0.5 + k.w / 2 + 0.25 && Math.abs(k.y - cy) < 0.5 + k.h / 2 + 0.25) { g.open = true; ev('gate', g.x, g.y, { key: g.key }); break; } }
          }
        }
        if (g.open && g.t < 1) g.t = Math.min(1, g.t + dt / 1.1);
      }
      // bookkeeping: rooms visited, treasure seen
      const pr = room(P.x, P.y);
      if (pr) { if (!S.visited[pr.id]) { S.visited[pr.id] = S.time || 0.001; ev('room', P.x, P.y, { room: pr.id, first: true }); if (pr.id === 'makers') { S.makersFound = true; ev('makers', P.x, P.y); } }
        S.room = pr; }
      for (const it of S.items) { const r = room(it.x, it.y); if (r && pr && r === pr) S.seen[it.id] = { x: it.x, y: it.y, room: r.id }; it.t += dt; }
      // victory: the Chalice inside the Gold Castle
      const ch = item('chalice');
      if (ch && !P.dead) { const r = room(ch.x, ch.y); if (r && r.id === 'gold_inner' && room(P.x, P.y) && room(P.x, P.y).id === 'gold_inner') { S.won = true; ev('win', ch.x, ch.y); } }
      return S.events;
    };
    function touchable(it) {
      if (it.kind === 'bridge') { // only the end posts pick the bridge up, so you can walk across it
        for (const s of [-1, 1]) { const ex = it.x + s * (it.w / 2 - 0.3); if (Math.abs(P.x - ex) * 2 < P.w + 0.6 && Math.abs(P.y - it.y) * 2 < P.h + it.h) return true; }
        return false;
      }
      return overlap(P, P.x, P.y, it, it.x, it.y);
    }
    S.touchable = touchable;
    S.roomOf = room;
    return S;
  }

  const api = { create, rng, ITEM_SIZE, DRAGONS, LAYOUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChaliceSim = api;
})(this);
