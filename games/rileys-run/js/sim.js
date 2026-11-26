/* ==========================================================================
   RILEY'S RUN — sim.js   (pure race simulation, no rendering)
   Fixed 60 Hz steps. Runners: progress s along the centre line, lane x (0..7),
   speed v, jump height y. Strategy lives in: launch timing, lane choice
   (inside line on bends, drafting, dodging), stamina (turbo vs conserve),
   hurdle timing and power-ups.
   ========================================================================== */
import { LANES, laneOff } from './tracks.js';

export const DT = 1 / 60;
export const ITEMS = {
  cleats: { name: 'GOLDEN CLEATS', icon: '👟', color: '#ffd23a', desc: 'Turbo rocket' },
  shield: { name: 'STAR SHIELD', icon: '⭐', color: '#7fe8ff', desc: 'Blocks slowdowns, smashes hurdles' },
  gust:   { name: 'GUST WAVE', icon: '💨', color: '#b7a6ff', desc: 'Shockwave knocks rivals back' },
  magnet: { name: 'SPRING MAGNET', icon: '🧲', color: '#7dff8a', desc: 'Auto-hurdles, pulls stars' },
  mud:    { name: 'MUD SPLASH', icon: '💩', color: '#b07a45', desc: 'Drop a trap behind you' },
};
ITEMS.mud.icon = '🟤';
export const ITEM_KEYS = Object.keys(ITEMS);

export const KIDS = {
  riley: { name: 'RILEY', full: 'Riley', top: 13.1, acc: 2.0, drain: 0.95, hops: 0.85, draft: 1.0, agg: 0.7, itemLove: 0.8, kick: 140, color: '#ff2fa0', hero: true },
  jaxon: { name: 'JAXON', full: 'Jaxon', top: 13.0, acc: 2.1, drain: 0.97, hops: 0.82, draft: 1.25, agg: 0.95, itemLove: 1.0, kick: 150, color: '#ff3030', hero: true },
  maya:  { name: 'MAYA', full: 'Maya "Rocket" Chen', top: 12.85, acc: 2.6, drain: 1.25, hops: 0.6, draft: 0.6, agg: 0.9, itemLove: 0.6, kick: 220, color: '#ffb000' },
  leo:   { name: 'LEO', full: 'Leo "Steady" Okafor', top: 12.6, acc: 1.6, drain: 0.7, hops: 0.7, draft: 0.9, agg: 0.4, itemLove: 0.5, kick: 260, color: '#2fd27a' },
  sofia: { name: 'SOFIA', full: 'Sofia "Spark" Ramirez', top: 12.65, acc: 1.9, drain: 1.0, hops: 0.6, draft: 0.8, agg: 0.8, itemLove: 1.6, kick: 120, color: '#a35bff' },
  theo:  { name: 'THEO', full: 'Theo "Tank" Brooks', top: 12.5, acc: 1.7, drain: 0.85, hops: 0.45, draft: 1.5, agg: 1.0, itemLove: 0.8, kick: 130, color: '#2f8bff' },
  ava:   { name: 'AVA', full: 'Ava "Hops" Patel', top: 12.65, acc: 1.9, drain: 0.95, hops: 1.0, draft: 0.8, agg: 0.6, itemLove: 0.7, kick: 140, color: '#00d2d2' },
  nico:  { name: 'NICO', full: 'Nico "Nitro" Rossi', top: 12.75, acc: 1.8, drain: 0.9, hops: 0.65, draft: 1.1, agg: 0.7, itemLove: 0.9, kick: 190, color: '#ff6a1f' },
};
export const DIFF = { rookie: { mul: 0.93, band: 0.6, name: 'ROOKIE' }, varsity: { mul: 0.985, band: 1.0, name: 'VARSITY' }, champion: { mul: 1.035, band: 1.25, name: 'CHAMPION' } };

export function rng(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }

const JUMP_V = 5.3, GRAV = 15.5, HURDLE_H = 0.5;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// lane to snap back to when a lane change toward L is refused: the lane we are in (never L itself)
const backLane = (x, L) => { const n = Math.round(x); return n !== L ? n : L - Math.sign(L - x || 1); };

export class Race {
  constructor(course, opt) {
    this.c = course; this.opt = opt; this.rand = rng(opt.seed || 1);
    this.t = 0; this.phase = 'marks'; this.phaseT = 0; this.goT = 0;
    this.setDur = 1.1 + this.rand() * 1.1;
    this.events = []; this.traps = []; this.knocked = new Set(); this.finishOrder = [];
    this.boxes = []; // item boxes: {s, l, t(respawn timer)}
    course.items.forEach((s, i) => { const odd = i % 2; for (let l = odd; l < LANES; l += 2) this.boxes.push({ s, l, t: 0 }); });
    this.stars = []; course.stars.forEach((s, i) => { const l0 = Math.floor(this.rand() * 6); for (let k = 0; k < 3; k++) this.stars.push({ s: s + k * 2.2, l: l0 + (i % 2 ? k * 0.5 : 0), got: 0 }); });
    this.diff = DIFF[opt.diff] || DIFF.varsity;
    this.runners = opt.field.map((f, i) => this.mkRunner(f, i));
    this.slowmo = 0; this.photo = false;
  }
  mkRunner(f, i) {
    const k = KIDS[f.kid];
    const human = !!f.human;
    const mul = human ? 1 : this.diff.mul * (f.kid === 'jaxon' ? 1.012 : 1);
    return {
      id: i, kid: f.kid, k, name: k.name, human, remote: !!f.remote, local: !!f.local,
      top: k.top * mul, s: this.c.start, x: f.lane, vx: 0, v: 0, y: 0, vy: 0,
      stamina: 100, gassed: false, draft: 0, drafting: null, sling: 0, boost: 0, rocket: 0, cleats: 0, shield: 0, magnet: 0,
      stumble: 0, mud: 0, slip: 0, slipDir: 0, item: null, itemCool: 0, launched: false, falseStart: 0, react: 0,
      finished: false, time: 0, place: 0, lap: 1, input: { steer: 0, jump: false, turbo: false, conserve: false, use: false, launch: false },
      ai: { lane: f.lane, t: 0, jumpAt: -1, burst: 0, react: 0.11 + this.rand() * 0.22, err: (1 - k.hops) * 0.3 + 0.035, holdItem: 1 + this.rand() * 2 },
      stats: { perfect: 0, clipped: 0, items: 0, topV: 0, rocket: false, splits: [], drafted: 0, stars: 0 }, phase: this.rand() * 6, nextSplit: 100,
      prevJump: false, prevUse: false, wasDraftCharged: false, autoLane: null, lastHit: 0,
    };
  }
  emit(type, r, extra) { this.events.push(Object.assign({ type, id: r ? r.id : -1 }, extra || {})); }
  progress(r) { return r.s - this.c.start; }
  remaining(r) { return this.c.dist - this.progress(r); }
  leaderHuman() { let b = null; for (const r of this.runners) if (r.human && (!b || r.s > b.s)) b = r; return b; }

  step() {
    const dt = DT; this.t += dt; this.phaseT += dt;
    if (this.phase === 'marks' && this.phaseT > 1.6) { this.phase = 'set'; this.phaseT = 0; this.emit('set'); }
    else if (this.phase === 'set' && this.phaseT > this.setDur + (this.opt.follow ? 4 : 0)) { // online guest: wait for the host's GO (fallback after 4 s)
      this.phase = 'go'; this.phaseT = 0; this.goT = this.t; this.emit('go'); }
    for (const b of this.boxes) if (b.t > 0) b.t -= dt;
    for (const r of this.runners) {
      if (r.remote) continue; // the other player's device (or the host) simulates them
      if (!r.human) this.think(r, dt); // the other player's device simulates them
      this.move(r, dt);
    }
    if (this.phase === 'go') this.interact(dt);
    // photo finish detection (around the local human)
    const me = this.runners.find(r => r.local);
    this.photo = false;
    if (me && !me.finished && this.phase === 'go') {
      const rem = this.remaining(me);
      if (rem < 14 && rem > -1) for (const o of this.runners) if (o !== me && !o.finished && Math.abs(o.s - me.s) < 1.6) this.photo = true;
    }
    if (this.finishOrder.length === this.runners.length && this.phase !== 'done') { this.phase = 'done'; this.emit('done'); }
  }

  /* ------------------------- physics for one runner ------------------------- */
  move(r, dt) {
    const c = this.c, inp = r.input;
    if (r.finished) { // jog down after the line
      r.v = Math.max(3, r.v - 4 * dt); r.s += r.v * dt; r.x += (clamp(r.x, 0.3, 6.7) - r.x) * dt; r.phase += r.v * dt * 0.62; r.y = 0;
      return;
    }
    if (this.phase !== 'go') {
      // false start: pressing launch during SET
      if (this.phase === 'set' && inp.launch && !r.falseStart && r.human) { r.falseStart = 1; this.emit('false', r); }
      return;
    }
    if (!r.launched) {
      const since = this.t - this.goT;
      if (r.human ? (inp.launch || inp.turbo || inp.jump || since > 1.2) : since > r.ai.react) {
        r.launched = true; r.react = since;
        if (r.falseStart) { r.stumble = 0.9; this.emit('stumble', r, { why: 'FALSE START' }); }
        else if (since < 0.22) { r.rocket = 1.4; r.stats.rocket = true; this.emit('rocket', r, { rt: since }); }
        else if (since < 0.4) { r.rocket = 0.6; this.emit('goodstart', r, { rt: since }); }
        r.v = 2.5;
      } else return;
    }
    // ---- target speed
    const k = r.k, top = r.top;
    let tgt = top * 0.86, drain = 0, regen = 5.5;
    if (r.gassed && r.stamina > 30) r.gassed = false;
    if (inp.conserve) { tgt = top * 0.74; regen = 17; }
    else if (inp.turbo && !r.gassed) { tgt = top * 1.075; drain = 21 * k.drain; regen = 0; }
    if (r.gassed) { tgt = top * 0.79; regen = 9; }
    r.stamina = clamp(r.stamina + (regen - drain) * dt, 0, 100);
    if (r.stamina <= 0 && !r.gassed) { r.gassed = true; this.emit('gassed', r); }
    let mul = 1;
    if (r.drafting) mul += 0.045;
    if (r.sling > 0) mul += 0.2;
    if (r.boost > 0) mul += 0.22;
    if (r.rocket > 0) mul += 0.32;
    if (r.cleats > 0) mul += 0.36;
    const protectedFx = r.shield > 0;
    if (!protectedFx) {
      if (r.mud > 0) mul -= 0.42;
      if (r.slip > 0) mul -= 0.16;
      if (r.stumble > 0) mul -= 0.5;
    }
    // wind gusts: headwind unless sheltered by a runner ahead
    const g = this.gustAt(r.s);
    if (g && !protectedFx) { if (!r.drafting) mul -= 0.13; r.x += g.side * 0.55 * dt * (r.drafting ? 0.3 : 1); }
    // rubber band (CPU runners only)
    if (!r.human) {
      const h = this.leaderHuman();
      if (h && !h.finished) {
        const gap = r.s - h.s, band = this.diff.band * (r.kid === 'jaxon' ? 1.35 : 1);
        if (gap < -12) mul += Math.min(0.075, (-gap - 12) * 0.004) * band;
        else if (gap > 18) mul -= Math.min(0.07, (gap - 18) * 0.0035) / band;
        if (r.kid === 'jaxon' && this.remaining(r) < 90 && Math.abs(gap) < 6) mul += 0.02 * band; // rivalry kick
      }
    }
    tgt *= Math.max(0.3, mul);
    const rate = tgt > r.v ? (r.k.acc * (r.v < 6 ? 1.4 : 1)) : 3.2;
    r.v += (tgt - r.v) * Math.min(1, rate * dt);
    // timers
    for (const key of ['sling', 'boost', 'rocket', 'cleats', 'shield', 'magnet', 'stumble', 'mud', 'slip', 'itemCool']) if (r[key] > 0) r[key] = Math.max(0, r[key] - dt);
    // ---- jump
    const onGround = r.y <= 0.0001 && r.vy <= 0;
    if (inp.jump && !r.prevJump && onGround && r.stumble <= 0.2) this.jump(r, JUMP_V);
    else if (r.magnet > 0 && onGround) { // Spring Magnet: auto-clears hurdles at the perfect moment
      for (const h of c.hurdles) { const dd = h - r.s; if (dd > 0 && dd / Math.max(1, r.v) <= JUMP_V / GRAV) { this.jump(r, JUMP_V); break; } }
    }
    r.prevJump = inp.jump;
    if (!onGround || r.vy > 0) { r.vy -= GRAV * dt; r.y += r.vy * dt; if (r.y <= 0) { r.y = 0; r.vy = 0; this.emit('land', r); } }
    // ---- lateral
    const air = r.y > 0.05;
    let steer = clamp(inp.steer, -1, 1);
    if (r.autoLane !== null && this.phase === 'go' && Math.abs(r.autoLane - r.x) > 0.3) { // someone running alongside in the target lane: refuse, snap back
      const L = r.autoLane;
      for (const b of this.runners) if (b !== r && !b.finished && Math.abs(b.s - r.s) < 1.0 && Math.abs(b.x - L) < 0.45 && b.y < 0.4 && r.y < 0.4) { r.autoLane = backLane(r.x, L); if (r.local) this.emit('laneblocked', r); break; }
    }
    if (r.autoLane !== null && Math.abs(steer) < 0.05) { const d = r.autoLane - r.x; steer = clamp(d * 3, -1, 1); if (Math.abs(d) < 0.03) r.autoLane = null; }
    else if (Math.abs(steer) > 0.05) r.autoLane = null;
    const lr = 3.4 * (air ? 0.55 : 1);
    if (r.slip > 0 && !protectedFx) steer += r.slipDir * 0.6;
    r.vx += (steer * lr - r.vx) * Math.min(1, 12 * dt);
    if (Math.abs(inp.steer) < 0.05 && r.autoLane === null && r.slip <= 0) { // gentle lane-centre assist
      const near = Math.round(r.x); r.vx += (near - r.x) * 4 * dt;
    }
    r.x = clamp(r.x + r.vx * dt, 0, LANES - 1);
    // ---- advance along the centre line (inside lanes are shorter on bends)
    const q = c.path.at(r.s), fac = Math.max(0.6, 1 - q.k * laneOff(r.x));
    const prevS = r.s;
    r.s += r.v * dt / fac;
    r.phase += r.v * dt * 0.62;
    r.stats.topV = Math.max(r.stats.topV, r.v);
    // lap / split / finish
    const prog = this.progress(r);
    if (c.path.loop) { const L = c.path.len; r.lap = Math.min(this.opt.laps || 1, 1 + Math.floor(Math.max(0, prog) / L)); }
    if (prog >= r.nextSplit) { r.stats.splits.push(+(this.t - this.goT).toFixed(2)); r.nextSplit += 100; }
    this.crossings(r, prevS, r.s);
    if (prog >= c.dist && !r.finished) this.finish(r, this.t - this.goT - (prog - c.dist) / Math.max(1, r.v));
  }
  jump(r, v) { r.vy = v; r.y = 0.001; r.jumpT = this.t; this.emit('jump', r); }
  gustAt(s) { for (const g of this.c.gusts) if (s >= g.s0 && s <= g.s1) return g; return null; }
  finish(r, time) {
    r.finished = true; r.time = +time.toFixed(3); this.finishOrder.push(r.id); r.place = this.finishOrder.length;
    this.emit('finish', r, { place: r.place, time: r.time });
  }
  // remote runner (online): apply received state
  setRemote(r, st) {
    r.s = st[0]; r.x = st[1]; r.v = st[2]; r.y = st[3]; const fl = st[4] | 0;
    r.shield = fl & 1 ? 1 : 0; r.cleats = fl & 2 ? 1 : 0; r.boost = fl & 4 ? 1 : 0; r.stumble = fl & 8 ? 0.3 : 0; r.launched = !!(fl & 16);
    r.phase += r.v * DT * 0.62 * 2;
  }
  packRunner(r) { return [+r.s.toFixed(2), +r.x.toFixed(3), +r.v.toFixed(2), +r.y.toFixed(2), (r.shield > 0) | ((r.cleats > 0) << 1) | ((r.boost > 0) << 2) | ((r.stumble > 0) << 3) | ((r.launched) << 4)]; }

  /* hurdles / pads / puddles / ramps / traps crossed between s0 and s1 */
  crossings(r, s0, s1) {
    const c = this.c, ground = r.y < 0.05, lane = r.x;
    const crossed = s => s > s0 && s <= s1;
    c.hurdles.forEach((hs, hi) => {
      if (!crossed(hs)) return;
      const key = hi * 8 + Math.round(lane);
      if (this.knocked.has(key)) return;
      if (r.shield > 0 && r.y < HURDLE_H) { this.knocked.add(key); this.emit('smash', r, { h: hi, l: Math.round(lane) }); return; }
      if (r.y >= HURDLE_H) {
        const apex = r.jumpT + JUMP_V / GRAV, err = Math.abs(this.t - apex);
        if (err < 0.11) { r.boost = Math.max(r.boost, 0.9); r.stats.perfect++; this.emit('perfect', r); }
        else this.emit('clear', r);
      } else {
        this.knocked.add(key); r.stumble = 0.7; r.v *= 0.72; r.stats.clipped++; this.emit('clip', r, { h: hi, l: Math.round(lane) });
      }
    });
    for (const b of c.boost) if (crossed(b.s) && ground) for (const l of b.l) if (Math.abs(lane - l) < 0.62) { r.boost = 1.1; this.emit('pad', r); }
    for (const p of c.puddles) if (crossed(p.s) && ground && Math.abs(lane - p.l) < 0.75 && r.shield <= 0) { r.slip = 0.85; r.slipDir = this.rand() < 0.5 ? -1 : 1; this.emit('splash', r); }
    for (const p of c.ramps) if (crossed(p.s) && ground && lane >= p.l0 - 0.45 && lane <= p.l1 + 0.45) { this.jump(r, 7.2); r.boost = Math.max(r.boost, 1.2); this.emit('ramp', r); }
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      if (t.owner === r.id && this.t - t.t0 < 1.5) continue;
      if (crossed(t.s) && Math.abs(lane - t.x) < 0.7 && ground) {
        if (r.shield <= 0) { r.mud = 1.1; this.emit('mudhit', r, { by: t.owner }); } else this.emit('shieldblock', r);
        this.traps.splice(i, 1); this.emit('trapgone', null, { tid: t.id });
      }
    }
    // stars + item boxes
    const pull = r.magnet > 0 ? 2.6 : 0.6;
    for (const st of this.stars) if (!st.got && st.s > s0 - (r.magnet > 0 ? 3 : 0.6) && st.s <= s1 + (r.magnet > 0 ? 3 : 0.4) && Math.abs(st.l - lane) < pull && r.y < 1.6) {
      st.got = 1; r.stamina = Math.min(100, r.stamina + 9); r.draft = Math.min(100, r.draft + 8); r.stats.stars++; this.emit('star', r, { si: this.stars.indexOf(st) });
    }
    for (const b of this.boxes) if (b.t <= 0 && b.s > s0 - (r.magnet > 0 ? 2 : 0.5) && b.s <= s1 + 0.5 && Math.abs(b.l - lane) < (r.magnet > 0 ? 1.6 : 0.62) && r.y < 1.8) {
      b.t = 3; this.emit('box', r, { bi: this.boxes.indexOf(b) });
      if (!r.item) { r.item = this.rollItem(r); r.itemCool = 0.4; this.emit('item', r, { item: r.item }); }
    }
  }
  rollItem(r) {
    // positional luck: leaders get defensive items, trailers get speed
    const place = this.runners.filter(o => o.s > r.s).length, n = this.runners.length, f = place / (n - 1);
    const w = { cleats: 0.6 + 2 * f, shield: 1.2 - 0.6 * f, gust: 0.7 + f, magnet: 0.9, mud: 1.5 - 1.2 * f };
    if (!this.c.hurdles.length) w.magnet = 0.5;
    let sum = 0; for (const kk in w) sum += w[kk]; let x = this.rand() * sum;
    for (const kk in w) { x -= w[kk]; if (x <= 0) return kk; } return 'cleats';
  }
  useItem(r) {
    const it = r.item; if (!it || r.itemCool > 0 || !r.launched || r.finished) return;
    r.item = null; r.stats.items++;
    if (it === 'cleats') r.cleats = 2.6;
    else if (it === 'shield') r.shield = 5;
    else if (it === 'magnet') r.magnet = 6;
    else if (it === 'gust') {
      for (const o of this.runners) if (o !== r && !o.finished && Math.abs(o.s - r.s) < 7.5 && Math.abs(o.x - r.x) < 3.2) this.hitGust(o, r.id);
      this.emit('gustfx', r, { s: r.s, x: r.x });
      return this.emit('use', r, { item: it });
    } else if (it === 'mud') { const t = { id: Math.floor(this.rand() * 1e9), s: r.s - 1.6, x: Math.round(r.x), owner: r.id, t0: this.t }; this.traps.push(t); this.emit('trap', r, { trap: t }); }
    this.emit('use', r, { item: it });
  }
  hitGust(o, by) {
    if (o.remote) { this.emit('netgust', o, { by }); return; }
    if (o.shield > 0) { this.emit('shieldblock', o); return; }
    o.stumble = Math.max(o.stumble, 0.55); o.v *= 0.78; o.s -= 0.6; o.lastHit = by; this.emit('gusthit', o, { by });
  }

  /* drafting, blocking, bumping */
  interact(dt) {
    const rs = this.runners;
    for (const a of rs) {
      if (a.finished || !a.launched || a.remote) continue;
      let best = null, bg = 99;
      for (const b of rs) {
        if (b === a || b.finished) continue;
        const gap = b.s - a.s, dx = Math.abs(b.x - a.x);
        if (gap > 0 && gap < 7 && dx < 0.6 && gap < bg) { bg = gap; best = b; }
        // blocking: can't run through someone directly ahead
        if (gap > 0 && gap < 0.95 && dx < 0.5 && a.y < 0.4 && b.y < 0.4) { a.s = b.s - 0.95; a.v = Math.min(a.v, b.v * 0.985); if (a.local) a.blockedT = 0.3; }
        // side bump
        if (Math.abs(gap) < 0.7 && dx < 0.55 && dx > 0.001) { const push = (0.55 - dx) * 2.5 * dt * Math.sign(a.x - b.x); a.x = clamp(a.x + push, 0, 7);
          if (a.autoLane !== null && Math.sign(a.autoLane - a.x) === -Math.sign(push)) { a.autoLane = backLane(a.x, a.autoLane); if (a.local) this.emit('laneblocked', a); } }
      }
      const wasDrafting = !!a.drafting;
      a.drafting = best && bg > 0.9 ? best : null;
      if (a.drafting) { a.draft = Math.min(100, a.draft + 26 * a.k.draft * dt); a.stats.drafted += dt; if (a.draft >= 100 && !a.wasDraftCharged) { a.wasDraftCharged = true; this.emit('slingready', a); } }
      else {
        if (wasDrafting && a.draft >= 55) { a.sling = 1.7 * a.draft / 100; this.emit('sling', a); a.draft = 0; a.wasDraftCharged = false; }
        a.draft = Math.max(0, a.draft - 8 * dt);
      }
      if (a.blockedT > 0) a.blockedT -= dt;
    }
  }

  /* ------------------------------- CPU brain ------------------------------- */
  think(r, dt) {
    const inp = r.input, ai = r.ai, c = this.c, k = r.k;
    inp.launch = false;
    if (this.phase !== 'go' || r.finished) { inp.turbo = inp.jump = false; return; }
    ai.t -= dt;
    const rem = this.remaining(r);
    if (ai.t <= 0) {
      ai.t = 0.14 + this.rand() * 0.1;
      // ---- choose a lane
      let bestL = Math.round(r.x), bestScore = -1e9;
      const kA = c.path.kAhead(r.s, 34);
      for (let L = 0; L < LANES; L++) {
        let sc = -0.32 * Math.abs(L - r.x) - (L === 0 || L === 7 ? 0.08 : 0);
        sc += Math.sign(kA) * Math.min(1, Math.abs(kA) * 40) * (3.5 - L) * 0.24;           // inside line on bends
        for (const p of c.puddles) { const d = p.s - r.s; if (d > 0 && d < 26 && Math.abs(p.l - L) < 1) sc -= 2.2; }
        for (const t of this.traps) { const d = t.s - r.s; if (d > 0 && d < 22 && Math.abs(t.x - L) < 1) sc -= 2.6; }
        for (const p of c.ramps) { const d = p.s - r.s; if (d > 0 && d < 35 && L >= p.l0 && L <= p.l1) sc += 0.9; }
        for (const b of c.boost) { const d = b.s - r.s; if (d > 0 && d < 30 && b.l.includes(L)) sc += 0.8; }
        if (!r.item) for (const b of this.boxes) { const d = b.s - r.s; if (b.t <= 0 && d > 2 && d < 32 && b.l === L) sc += 1.1 * k.itemLove; }
        for (const st of this.stars) { const d = st.s - r.s; if (!st.got && d > 0 && d < 20 && Math.abs(st.l - L) < 0.6) sc += 0.18; }
        for (const o of this.runners) {
          if (o === r || o.finished) continue;
          const d = o.s - r.s;
          if (Math.abs(o.x - L) < 0.6) {
            if (d > 0 && d < 3.2 && o.v < r.v + 0.4) sc -= 1.3;                         // stuck behind
            if (d > 1.2 && d < 7) sc += (r.draft < 85 ? 0.95 : -0.9) * k.draft * (this.gustAt(r.s + 10) ? 1.8 : 1); // tuck in / pull out
            if (d > -1.4 && d < 1.2 && L !== Math.round(r.x)) sc -= 2;                   // occupied beside
          }
        }
        if (sc > bestScore) { bestScore = sc; bestL = L; }
      }
      ai.lane = bestL;
      // ---- pace
      const kick = k.kick * (0.85 + 0.3 * this.rand());
      if (rem < kick && r.stamina > 8) ai.burst = 1;
      else if (r.stamina > 82 && this.rand() < 0.12 * k.agg && Math.abs(kA) < 0.005) ai.burst = 0.9 + this.rand();
      else if (r.stamina < 45 || rem > kick + 60) ai.burst = Math.max(0, ai.burst - 0.4);
      inp.conserve = r.stamina < 28 && rem > 140 && !ai.burst;
      // ---- items
      if (r.item) {
        ai.holdItem -= 0.2;
        const nearAhead = this.runners.some(o => o !== r && o.s - r.s > -1 && o.s - r.s < 6 && Math.abs(o.x - r.x) < 2.6);
        const nearBehind = this.runners.some(o => o !== r && r.s - o.s > 1 && r.s - o.s < 9 && Math.abs(o.x - r.x) < 1.2);
        const hurdleSoon = c.hurdles.some(h => h - r.s > 2 && h - r.s < 10);
        let use = false;
        if (r.item === 'cleats') use = rem < 130 || (ai.holdItem < 0 && Math.abs(kA) < 0.004);
        else if (r.item === 'shield') use = hurdleSoon || ai.holdItem < -3 || this.traps.some(t => t.s - r.s > 0 && t.s - r.s < 8 && Math.abs(t.x - r.x) < 0.8);
        else if (r.item === 'gust') use = nearAhead && ai.holdItem < 0;
        else if (r.item === 'mud') use = nearBehind || ai.holdItem < -4;
        else use = true;
        if (use) { this.useItem(r); ai.holdItem = 1 + this.rand() * 2.5; }
      }
    }
    inp.turbo = ai.burst > 0 && !r.gassed && r.stamina > 3;
    if (inp.turbo && ai.burst < 1) ai.burst -= dt * 0.8;
    const d = ai.lane - r.x; inp.steer = Math.abs(d) < 0.06 ? 0 : clamp(d * 2.2, -1, 1);
    // ---- jumps: hurdles (aim to cross at the apex), puddles/traps when stuck in lane
    inp.jump = false;
    const tApex = JUMP_V / GRAV;
    const autoJ = r.magnet > 0;
    for (const h of c.hurdles) {
      const dd = h - r.s; if (dd <= 0 || dd > 12) continue;
      const tt = dd / Math.max(1, r.v);
      const want = tApex + (autoJ ? 0 : ai.jumpErr ?? 0);
      if (tt <= want && r.y <= 0) { inp.jump = true; ai.jumpErr = (this.rand() * 2 - 1) * ai.err * 1.6; }
      break;
    }
    for (const t of this.traps) { const dd = t.s - r.s; if (dd > 0 && dd < 2.4 && Math.abs(t.x - r.x) < 0.7 && this.rand() < 0.5) inp.jump = true; }
    for (const p of c.puddles) { const dd = p.s - r.s; if (dd > 0 && dd < 2.2 && Math.abs(p.l - r.x) < 0.75 && this.rand() < 0.7 * k.hops + 0.2) inp.jump = true; }
  }
}

/* human runner with an auto-pilot (used by tests / attract mode) */
export function autopilot(race, r) { r.human = false; race.think(r, DT); r.human = true; r.input.launch = race.phase === 'go'; }
