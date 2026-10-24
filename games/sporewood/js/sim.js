/* SPOREWOOD — sim.js
   The rules of the 1981 bug-blasting coin-op on a 30 x 31 grid of 8-unit cells (240 x 248 units), at a fixed
   60 Hz tick. Deterministic from a seed (both online players start from the same field).

   CENTIPEDE  A chain is a head plus body segments that follow the exact path the head took (a per-step trail,
              8 steps per segment). The head runs along its row; when the next cell is a mushroom or the edge
              it drops one row and reverses. At the bottom it climbs back up, but only inside the player zone.
              A POISONED mushroom sends the head diving straight to the bottom. Shooting a segment turns it into
              a mushroom and splits the chain: the segment behind becomes a new head. Lone heads run faster.
              Once a head reaches the bottom, extra heads start entering the player zone from the sides.
   FLEA       (wave 2+) drops straight down when the player zone runs short of mushrooms, sowing mushrooms as
              it falls. Two hits: the first one only makes it fall faster. 200.
   SPIDER     zig-zags through the bottom of the field, eating mushrooms. 300 / 600 / 900 the closer it is.
   SCORPION   (wave 3+) crawls across the upper field poisoning every mushroom it touches. 1000.
   MUSHROOMS  take 4 hits (1 point). When you die, every damaged or poisoned mushroom is restored for 5.
   ========================================================================================================== */
const Sim = (() => {
  'use strict';
  const COLS = 30, ROWS = 31, CELL = 8, FW = COLS * CELL, FH = ROWS * CELL, ZONE = 25, SPIDER_TOP = 19, LIVES_MAX = 6;
  const PTS = { head: 100, body: 10, mush: 1, flea: 200, scorp: 1000, restore: 5 };
  const SHOT_V = 9, SHOT_SUB = 6;            // units per tick (crosses the field in under half a second), substeps
  let G = null, E = [];
  let rs = 1;
  const rnd = () => { rs = rs + 0x6D2B79F5 | 0; let t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ri = n => (rnd() * n) | 0;
  const idx = (c, r) => r * COLS + c;
  const inGrid = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  const mushAt = (c, r) => inGrid(c, r) && G.mush[idx(c, r)] > 0;
  const ev = o => { E.push(o); };

  function place(c, r, why) {
    if (!inGrid(c, r)) return false; const i = idx(c, r); if (G.mush[i]) return false;
    G.mush[i] = 4; G.pois[i] = 0; G.mvar[i] = ri(6); G.mborn[i] = G.t; if (why) ev({ t: 'grow', c, r, why }); return true;
  }
  function kill(c, r) { const i = idx(c, r); G.mush[i] = 0; G.pois[i] = 0; }

  /* ---------------- waves ---------------- */
  function cfg(w) {
    const k = (w - 1) % 12;
    return { chain: 12 - k, heads: k, speed: Math.min(2.6, 1.5 + 0.1 * Math.min(w - 1, 11)), flea: w >= 2 ? Math.min(9, 4 + w) : 0, scorp: w >= 3,
      spiderV: Math.min(1.6, 0.9 + 0.07 * (w - 1)), headEvery: Math.max(80, 230 - 15 * (w - 1)) };
  }
  function mkChain(len, x, y, dir, vdir, pre) {
    const c = { len, trail: [], dir, vdir, mode: 'h', vy: 0, vt: 0, poison: false, acc: 0, id: G.nid++ };
    if (pre === 'above') for (let k = len * 8 + 8; k >= 1; k--) c.trail.push(x, y - k);
    c.trail.push(x, y);
    return c;
  }
  function spawnWave() {
    const C = cfg(G.wave); G.chains = []; G.headGen = false; G.headT = 0; G.speed = C.speed; G.C = C;
    const c0 = 13 + ri(4);
    G.chains.push(mkChain(C.chain, c0 * 8, 0, rnd() < 0.5 ? -1 : 1, 1, 'above'));
    for (let h = 0; h < C.heads; h++) {
      let col; do col = ri(COLS); while (Math.abs(col - c0) < 2 && C.heads < 20 && rnd() < 0.9);
      G.chains.push(mkChain(1, col * 8, 0, rnd() < 0.5 ? -1 : 1, 1, 'above'));
    }
    G.waveSegs = C.chain + C.heads;
  }
  /** after a death the survivors re-form at the top (same chains, same lengths) */
  function respawnChains() {
    const lens = G.chains.map(c => c.len).sort((a, b) => b - a); G.chains = []; G.headGen = false; G.headT = 0;
    lens.forEach((len, i) => G.chains.push(mkChain(len, (i === 0 ? 13 + ri(4) : ri(COLS)) * 8, 0, rnd() < 0.5 ? -1 : 1, 1, 'above')));
  }
  function field(w) {
    const n = 44 + Math.min(16, (w - 1) * 2);
    let k = 0, guard = 0;
    while (k < n && guard++ < 5000) { const c = ri(COLS), r = 1 + ri(ROWS - 3); if (place(c, r)) k++; }
  }

  function newGame(o) {
    o = o || {}; rs = (o.seed != null ? o.seed : (Math.random() * 1e9)) | 0;
    G = {
      wave: o.wave || 1, startWave: o.wave || 1, score: 0, lives: 3, extraAt: o.extraAt == null ? 12000 : o.extraAt, nextExtra: 0,
      t: 0, phase: 'ready', phaseT: 70, nid: 1,
      mush: new Uint8Array(COLS * ROWS), pois: new Uint8Array(COLS * ROWS), mvar: new Uint8Array(COLS * ROWS), mborn: new Int32Array(COLS * ROWS).fill(-9999),
      chains: [], player: { x: FW / 2, y: FH - 6, alive: true, bx: false, by: false, vx: 0, vy: 0 }, shot: null,
      flea: null, spider: null, scorp: null, fleaT: 60, spiderT: 240, scorpT: 600, forceFleas: 0, headGen: false, headT: 0,
      shotsFired: 0, kills: { head: 0, body: 0, flea: 0, spider: 0, scorp: 0 }, restoreQ: null, deaths: 0, raidsIn: 0, cleared: 0,
    };
    G.nextExtra = G.extraAt || Infinity;
    field(G.wave); spawnWave(); E = [];
    return G;
  }

  /* ---------------- centipede movement ---------------- */
  const last = c => { const L = c.trail.length; return [c.trail[L - 2], c.trail[L - 1]]; };
  function segPos(c, i) {
    const L = c.trail.length, p = Math.min(i * 8, (L >> 1) - 1);
    return [c.trail[L - 2 - 2 * p], c.trail[L - 1 - 2 * p]];
  }
  /** heading of segment i (unit-ish vector) from its own trail */
  function segDir(c, i) {
    const L = c.trail.length, n = L >> 1, p = Math.min(i * 8, n - 1), q = Math.min(p + 3, n - 1);
    const dx = c.trail[L - 2 - 2 * p] - c.trail[L - 2 - 2 * q], dy = c.trail[L - 1 - 2 * p] - c.trail[L - 1 - 2 * q];
    return dx || dy ? [dx, dy] : [c.dir, 0];
  }
  function startVert(c, row, vd) {
    c.mode = 'v'; c.vy = vd; c.vt = (row + vd) * 8;
    if (row + vd >= ROWS - 1 && !G.headGen) { G.headGen = true; G.headT = G.C.headEvery; ev({ t: 'bottom' }); }
  }
  function turn(c, row) {
    let vd = c.vdir;
    if (vd > 0 && row >= ROWS - 1) vd = -1;
    else if (vd < 0 && row <= ZONE) vd = 1;
    c.vdir = vd; c.dir = -c.dir; startVert(c, row, vd);
  }
  function stepHead(c) {
    let [x, y] = last(c);
    if (c.mode === 'v') { y += c.vy; if (y === c.vt) c.mode = 'h'; c.trail.push(x, y); return; }
    if (y < 0) { c.mode = 'v'; c.vy = 1; c.vt = Math.floor(y / 8) * 8 + 8; y += 1; if (y === c.vt) c.mode = 'h'; c.trail.push(x, y); return; }
    if (x % 8 === 0 && y % 8 === 0) {
      const col = x / 8, row = y / 8;
      if (c.poison) {
        if (row < ROWS - 1) { startVert(c, row, 1); y += 1; if (y === c.vt) c.mode = 'h'; c.trail.push(x, y); return; }
        c.poison = false; c.vdir = -1; // hit the bottom: back to normal
      }
      const nc = col + c.dir;
      if (nc < 0 || nc >= COLS || mushAt(nc, row)) {
        if (inGrid(nc, row) && G.mush[idx(nc, row)] && G.pois[idx(nc, row)] && row < ROWS - 1) {
          c.poison = true; ev({ t: 'dive', x: x + 4, y: y + 4 }); startVert(c, row, 1); // straight down, no reversal
        } else turn(c, row);
        y += c.vy; if (y === c.vt) c.mode = 'h'; c.trail.push(x, y); return;
      }
    }
    x += c.dir; c.trail.push(x, y);
  }
  function moveChain(c) {
    c.acc += G.speed * (c.len === 1 ? 1.35 : 1);
    while (c.acc >= 1) { c.acc -= 1; stepHead(c); }
    const keep = (c.len * 8 + 24) * 2; if (c.trail.length > keep * 2) c.trail.splice(0, c.trail.length - keep);
  }
  /** a split-off rear part: work out where its new head was going from the trail */
  function derive(nc, parent) {
    const t = nc.trail, L = t.length, x = t[L - 2], y = t[L - 1];
    const dx = L >= 4 ? x - t[L - 4] : 0, dy = L >= 4 ? y - t[L - 3] : 0;
    let lastH = 0, lastV = 0;
    for (let j = L - 2; j >= 2; j -= 2) { const hx = t[j] - t[j - 2], hy = t[j + 1] - t[j - 1]; if (!lastV && hy) lastV = Math.sign(hy); if (hx) { lastH = Math.sign(hx); break; } }
    nc.vdir = lastV && y >= 0 ? (y >= ZONE * 8 ? lastV : 1) : parent.vdir; nc.poison = false;
    if (y % 8 !== 0) { nc.mode = 'v'; nc.vy = dy ? Math.sign(dy) : 1; nc.vt = nc.vy > 0 ? Math.ceil(y / 8) * 8 : Math.floor(y / 8) * 8; nc.dir = lastH ? -lastH : parent.dir; if (parent.poison && nc.vy > 0) { nc.poison = true; nc.dir = lastH || parent.dir; } }
    else if (dx) { nc.mode = 'h'; nc.dir = Math.sign(dx); }
    else { nc.mode = 'h'; nc.dir = lastH ? -lastH : (rnd() < 0.5 ? -1 : 1); }
  }
  function hitSeg(c, k) {
    const [x, y] = segPos(c, k), cx = x + 4, cy = y + 4;
    const col = Math.round(x / 8), row = Math.round(y / 8);
    if (row >= 0 && row < ROWS) place(Math.max(0, Math.min(COLS - 1, col)), row, 'seg');
    const head = k === 0; G.score += head ? PTS.head : PTS.body; G.kills[head ? 'head' : 'body']++;
    ev({ t: 'seg', x: cx, y: cy, head, p: head ? PTS.head : PTS.body });
    const L = c.trail.length, rear = c.len - k - 1;
    if (rear > 0) {
      const cut = Math.max(2, L - 2 * (k + 1) * 8);
      const nc = { len: rear, trail: c.trail.slice(0, cut), dir: c.dir, vdir: c.vdir, mode: 'h', vy: 0, vt: 0, poison: false, acc: c.acc, id: G.nid++ };
      derive(nc, c); G.chains.push(nc);
    }
    if (k === 0) G.chains.splice(G.chains.indexOf(c), 1); else c.len = k;
  }
  function segCount() { let n = 0; for (const c of G.chains) n += c.len; return n; }

  /* ---------------- critters ---------------- */
  function zoneMush() { let n = 0; for (let r = ZONE; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (G.mush[idx(c, r)]) n++; return n; }
  function spawnFlea(raid) { const col = ri(COLS); G.flea = { x: col * 8 + 4, y: -6, col, vy: 2.0 + Math.min(1.2, 0.08 * G.wave), hp: 2, lastRow: -1, raid: !!raid, t: 0 }; ev({ t: 'flea', on: true }); }
  function spawnSpider() {
    const left = rnd() < 0.5, C = G.C;
    G.spider = { x: left ? -10 : FW + 10, y: (SPIDER_TOP + 3 + ri(5)) * 8, dir: left ? 1 : -1, vx: C.spiderV * (0.65 + rnd() * 0.45), vy: (rnd() < 0.5 ? -1 : 1) * (1.1 + rnd()), mode: 'zig', modeT: 40 + ri(60), lastCell: -1, t: 0 };
    ev({ t: 'spider', on: true });
  }
  function spawnScorp() { const left = rnd() < 0.5; G.scorp = { x: left ? -12 : FW + 12, y: (2 + ri(17)) * 8 + 4, dir: left ? 1 : -1, vx: G.wave >= 6 ? 1.2 : 0.75, lastCell: -1, t: 0 }; ev({ t: 'scorp', on: true }); }
  function critters() {
    const C = G.C;
    // flea
    if (G.flea) {
      const f = G.flea; f.y += f.vy; f.t++;
      const row = Math.floor(f.y / 8);
      if (row !== f.lastRow && row >= 1 && row < ROWS - 1) { f.lastRow = row; if (rnd() < (row >= ZONE ? 0.42 : 0.24)) place(f.col, row, 'flea'); }
      if (f.y > FH + 8) { G.flea = null; ev({ t: 'flea', on: false }); G.fleaT = 30; }
    } else if (G.forceFleas > 0) { G.forceFleas--; spawnFlea(true); }
    else if (C.flea && zoneMush() < C.flea) { if (--G.fleaT <= 0) { spawnFlea(false); G.fleaT = 40 + ri(50); } }
    // spider
    if (G.spider) {
      const s = G.spider; s.t++;
      if (--s.modeT <= 0) { s.mode = rnd() < 0.3 ? 'hop' : 'zig'; s.modeT = s.mode === 'hop' ? 25 + ri(35) : 40 + ri(70); }
      s.y += s.vy;
      if (s.y < SPIDER_TOP * 8 + 4) { s.y = SPIDER_TOP * 8 + 4; s.vy = 1.0 + rnd() * 1.3; }
      if (s.y > FH - 4) { s.y = FH - 4; s.vy = -(1.0 + rnd() * 1.3); }
      if (s.mode === 'zig') s.x += s.dir * s.vx;
      const c = Math.floor(s.x / 8), r = Math.floor(s.y / 8), cell = inGrid(c, r) ? idx(c, r) : -1;
      if (cell >= 0 && cell !== s.lastCell) { s.lastCell = cell; if (G.mush[cell] && rnd() < 0.55) { kill(c, r); ev({ t: 'eat', x: c * 8 + 4, y: r * 8 + 4 }); } }
      if (s.x < -16 || s.x > FW + 16) { G.spider = null; ev({ t: 'spider', on: false }); G.spiderT = 90 + ri(160); }
    } else if (--G.spiderT <= 0) spawnSpider();
    // scorpion
    if (G.scorp) {
      const s = G.scorp; s.t++; s.x += s.dir * s.vx;
      const c = Math.floor(s.x / 8), r = Math.floor(s.y / 8), cell = inGrid(c, r) ? idx(c, r) : -1;
      if (cell >= 0 && cell !== s.lastCell) { s.lastCell = cell; if (G.mush[cell] && !G.pois[cell]) { G.pois[cell] = 1; ev({ t: 'poison', x: c * 8 + 4, y: r * 8 + 4 }); } }
      if (s.x < -20 || s.x > FW + 20) { G.scorp = null; ev({ t: 'scorp', on: false }); G.scorpT = 500 + ri(700); }
    } else if (C.scorp && --G.scorpT <= 0) spawnScorp();
    // extra heads in the player zone once the centipede has reached the bottom
    if (G.headGen && G.chains.length && G.chains.length < 10) {
      if (--G.headT <= 0) {
        G.headT = C.headEvery; const left = rnd() < 0.5, row = ZONE + ri(2);
        const c = mkChain(1, left ? 0 : FW - 8, row * 8, left ? 1 : -1, 1); c.fresh = true; G.chains.push(c); ev({ t: 'newhead', x: left ? 4 : FW - 4, y: row * 8 + 4 });
      }
    }
  }

  /* ---------------- player & shot ---------------- */
  const PR = 3.6; // player half-size
  function blocked(x, y) {
    if (x < 4 || x > FW - 4 || y < ZONE * 8 + 4 || y > FH - 4) return true;
    for (let r = Math.floor((y - PR) / 8); r <= Math.floor((y + PR) / 8); r++) for (let c = Math.floor((x - PR) / 8); c <= Math.floor((x + PR) / 8); c++)
      if (mushAt(c, r)) { const mx = c * 8 + 4, my = r * 8 + 4; if (Math.abs(mx - x) < PR + 3.3 && Math.abs(my - y) < PR + 3.3) return true; }
    return false;
  }
  function movePlayer(inp) {
    const p = G.player; p.bx = p.by = false;
    const dx = (inp.vx || 0) / 60, dy = (inp.vy || 0) / 60; p.vx = inp.vx || 0; p.vy = inp.vy || 0;
    // sub-step so a fast flick can't tunnel through a mushroom
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 1.5));
    for (let i = 0; i < n; i++) {
      if (dx) { const nx = Math.max(4, Math.min(FW - 4, p.x + dx / n)); if (blocked(nx, p.y) && !blocked(p.x, p.y)) p.bx = true; else { if (nx !== p.x + dx / n) p.bx = true; p.x = nx; } }
      if (dy) { const ny = Math.max(ZONE * 8 + 4, Math.min(FH - 4, p.y + dy / n)); if (blocked(p.x, ny) && !blocked(p.x, p.y)) p.by = true; else { if (ny !== p.y + dy / n) p.by = true; p.y = ny; } }
    }
  }
  const boxHit = (x, y, o, hw, hh) => o && Math.abs(x - o.x) <= hw && Math.abs(y - o.y) <= hh;
  function spiderPts() { const d = Math.abs(G.spider.y - G.player.y); return d < 16 ? 900 : d < 32 ? 600 : 300; }
  function moveShot() {
    const s = G.shot; if (!s) return;
    for (let k = 0; k < SHOT_SUB; k++) {
      s.y -= SHOT_V / SHOT_SUB;
      if (s.y < -2) { G.shot = null; return; }
      if (boxHit(s.x, s.y, G.flea, 4, 5)) {
        const f = G.flea;
        if (--f.hp > 0) { f.vy *= 2; ev({ t: 'fleaHit', x: f.x, y: f.y }); }
        else { G.score += PTS.flea; G.kills.flea++; ev({ t: 'fleaKill', x: f.x, y: f.y, p: PTS.flea }); G.flea = null; ev({ t: 'flea', on: false }); }
        G.shot = null; return;
      }
      if (boxHit(s.x, s.y, G.spider, 7, 5)) { const p = spiderPts(), sp = G.spider; G.score += p; G.kills.spider++; ev({ t: 'spiderKill', x: sp.x, y: sp.y, p }); G.spider = null; G.spiderT = 90 + ri(140); ev({ t: 'spider', on: false }); G.shot = null; return; }
      if (boxHit(s.x, s.y, G.scorp, 8, 4.5)) { const sc = G.scorp; G.score += PTS.scorp; G.kills.scorp++; ev({ t: 'scorpKill', x: sc.x, y: sc.y, p: PTS.scorp }); G.scorp = null; G.scorpT = 500 + ri(700); ev({ t: 'scorp', on: false }); G.shot = null; return; }
      for (const c of G.chains) for (let i = 0; i < c.len; i++) {
        const [x, y] = segPos(c, i); if (Math.abs(s.x - (x + 4)) <= 4 && Math.abs(s.y - (y + 4)) <= 4) { hitSeg(c, i); G.shot = null; return; }
      }
      const mc = Math.floor(s.x / 8), mr = Math.floor(s.y / 8);
      if (mushAt(mc, mr)) {
        const i = idx(mc, mr); G.mush[i]--;
        if (!G.mush[i]) { G.pois[i] = 0; G.score += PTS.mush; ev({ t: 'mushKill', x: mc * 8 + 4, y: mr * 8 + 4, c: mc, r: mr }); }
        else ev({ t: 'mushHit', x: mc * 8 + 4, y: mr * 8 + 4, hp: G.mush[i], pois: !!G.pois[i] });
        G.shot = null; return;
      }
    }
  }
  function checkDeath() {
    const p = G.player;
    for (const c of G.chains) for (let i = 0; i < c.len; i++) { const [x, y] = segPos(c, i); if (Math.abs(p.x - x - 4) < 6 && Math.abs(p.y - y - 4) < 6) return 'centipede'; }
    if (boxHit(p.x, p.y, G.spider, 8.5, 6.5)) return 'spider';
    if (boxHit(p.x, p.y, G.flea, 6, 7)) return 'flea';
    return null;
  }
  function die(by) {
    const p = G.player; p.alive = false; G.lives--; G.deaths++; G.shot = null; G.phase = 'dying'; G.phaseT = 100;
    ev({ t: 'die', x: p.x, y: p.y, by });
    if (G.spider) ev({ t: 'spider', on: false }); if (G.flea) ev({ t: 'flea', on: false }); if (G.scorp) ev({ t: 'scorp', on: false });
  }
  function extraLife() { if (G.extraAt && G.score >= G.nextExtra) { G.nextExtra += G.extraAt; if (G.lives < LIVES_MAX) { G.lives++; ev({ t: 'extra' }); } } }

  /* ---------------- main tick ---------------- */
  function tick(inp) {
    if (!G) return; inp = inp || {}; G.t++;
    const ph = G.phase, p = G.player;
    if (ph === 'over') return;
    if (ph === 'dying') { if (--G.phaseT <= 0) { G.phase = 'restore'; G.phaseT = 0; G.spider = G.flea = G.scorp = null; G.restoreQ = null; } return; }
    if (ph === 'restore') {
      if (!G.restoreQ) { G.restoreQ = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const i = idx(c, r); if (G.mush[i] && (G.mush[i] < 4 || G.pois[i])) G.restoreQ.push(i); } }
      if (++G.phaseT % 4 === 0 || !G.restoreQ.length) {
        const i = G.restoreQ.shift();
        if (i != null) { G.mush[i] = 4; G.pois[i] = 0; G.score += PTS.restore; extraLife(); ev({ t: 'restore', x: (i % COLS) * 8 + 4, y: Math.floor(i / COLS) * 8 + 4 }); }
        else {
          G.restoreQ = null;
          if (G.lives <= 0) { G.phase = 'over'; ev({ t: 'over' }); return; }
          respawnChains(); p.x = FW / 2; p.y = FH - 6; p.alive = true;
          for (let r = ROWS - 2; r < ROWS; r++) for (let c = 13; c <= 16; c++) kill(c, r);
          G.phase = 'ready'; G.phaseT = 60; G.spiderT = 200; G.fleaT = 90;
        }
      }
      return;
    }
    movePlayer(inp);
    if (inp.fire && !G.shot && p.alive) { G.shot = { x: p.x, y: p.y - 5 }; G.shotsFired++; ev({ t: 'shoot', x: p.x, y: p.y - 5 }); }
    if (ph === 'ready') { moveShot(); if (--G.phaseT <= 0) G.phase = 'play'; extraLife(); return; }
    if (ph === 'clear') {
      moveShot(); critters();
      if (--G.phaseT <= 0) { G.wave++; spawnWave(); G.phase = 'play'; ev({ t: 'wave', w: G.wave }); }
      extraLife(); return;
    }
    // play
    moveShot();
    for (const c of G.chains.slice()) moveChain(c);
    critters();
    extraLife();
    const by = G.god ? null : checkDeath(); if (by) { die(by); return; }
    if (!G.chains.length) { G.phase = 'clear'; G.phaseT = 70; G.cleared++; G.headGen = false; ev({ t: 'clear', w: G.wave }); }
  }
  /** online harassment from the rival: 'flea' = an extra flea now, 'row' = a row of mushrooms in your upper field */
  function raid(kind) {
    if (!G || G.phase === 'over') return 0; G.raidsIn++;
    if (kind === 'flea') { G.forceFleas++; return 1; }
    let best = 6, bn = 99; for (let r = 5; r <= 17; r++) { let n = 0; for (let c = 0; c < COLS; c++) if (G.mush[idx(c, r)]) n++; if (n < bn) { bn = n; best = r; } }
    let k = 0; for (let c = ri(2); c < COLS; c += 2 + (rnd() < 0.3 ? 1 : 0)) if (place(c, best, 'raid')) k++;
    ev({ t: 'raidRow', row: best, n: k }); return k;
  }
  function drain() { const e = E; E = []; return e; }
  return {
    COLS, ROWS, CELL, FW, FH, ZONE, SPIDER_TOP, PTS, LIVES_MAX, SHOT_V,
    get G() { return G; }, newGame, tick, drain, raid, segPos, segDir, segCount, zoneMush, cfg, idx, mushAt, place, spawnFlea, spawnSpider, spawnScorp, hitSeg, mkChain,
    get rs() { return rs; }, set rs(v) { rs = v; },
  };
})();
