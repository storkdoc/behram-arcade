/* ==========================================================================
   MUSHROOM CLOUD — sim.js
   The whole war as plain data: DEFCON clock, units, missiles, interceptors,
   aircraft, fog of war, diplomacy, population and scoring. No rendering.
   Host-authoritative: the host (or the single-player page) runs Game; every
   screen draws Game.viewFor(myBloc), which only contains what that bloc can
   legitimately see. Runs in browsers and in Node (tests).
   ========================================================================== */
(function (root) {
  'use strict';
  const World = root.MCWorld || (typeof require !== 'undefined' ? require('./world.js') : null);
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  /* ---------- blocs, units, scenarios ---------- */
  const BLOCS = [
    { id: 0, key: 'WA', name: 'Western Alliance', short: 'WESTERN ALLIANCE', color: '#3fa4ff' },
    { id: 1, key: 'EB', name: 'Eastern Bloc', short: 'EASTERN BLOC', color: '#ff4b4b' },
    { id: 2, key: 'PC', name: 'Pacific Coalition', short: 'PACIFIC COALITION', color: '#ffb02e' },
    { id: 3, key: 'EU', name: 'Continental Union', short: 'CONTINENTAL UNION', color: '#b28cff' },
    { id: 4, key: 'SA', name: 'Southern Accord', short: 'SOUTHERN ACCORD', color: '#3ef0a6' },
    { id: 5, key: 'MC', name: 'Meridian Compact', short: 'MERIDIAN COMPACT', color: '#f4e04d' },
  ];
  // stock: warheads (wh), interceptors (abm), fighters (fi), bombers (bo)
  const UNIT = {
    silo:    { name: 'ICBM Silo', key: 1, cost: 12, max: 6, land: true, sight: 4, wh: 8, abm: 14, abmRange: 10, abmPk: 0.42, abmCd: 2, aaRange: 4, aaPk: 0.45 },
    radar:   { name: 'Early-Warning Radar', key: 2, cost: 4, max: 6, land: true, sight: 4, radar: 30 },
    sam:     { name: 'Interceptor Battery', key: 3, cost: 6, max: 8, land: true, sight: 10, abm: 24, abmRange: 10, abmPk: 0.6, abmCd: 1.2, aaRange: 6, aaPk: 0.65 },
    airbase: { name: 'Airbase', key: 4, cost: 10, max: 4, land: true, sight: 4, fi: 5, bo: 3 },
    sub:     { name: 'Ballistic-Missile Sub', key: 5, cost: 12, max: 4, land: false, sight: 3, wh: 5, speed: 0.10 },
    carrier: { name: 'Carrier Group', key: 6, cost: 10, max: 4, land: false, sight: 8, sonar: 5, fi: 4, abm: 10, abmRange: 3, abmPk: 0.4, abmCd: 2.5, aaRange: 3, aaPk: 0.5, speed: 0.12 },
  };
  const TYPES = ['silo', 'radar', 'sam', 'airbase', 'sub', 'carrier'];
  const AIR = { fighter: { speed: 0.8, fuel: 75, sight: 6, aaRange: 2, aaPk: 0.3 }, bomber: { speed: 0.45, fuel: 420, sight: 4, release: 8 } };
  const BUDGET = 120;
  // phase lengths in game seconds (time compression multiplies these away)
  const PHASE = { 5: 150, 4: 120, 3: 180, 2: 150 };
  const D1_LEN = 540, FINAL = 60;
  const SCENARIOS = {
    brink:   { name: 'BRINKMANSHIP', sub: 'One rival. One line.', blurb: 'A head-to-head standoff between two superpower blocs. The rest of the world watches.', blocs: 2, def: [0, 1] },
    pacific: { name: 'PACIFIC STANDOFF', sub: 'Three powers. Two alliances possible.', blurb: 'A three-way crisis. Diplomacy decides who stands with whom when the sirens start.', blocs: 3, def: [0, 1, 2] },
    six:     { name: 'SIX BLOCS', sub: 'The whole board.', blurb: 'Every bloc armed, every bloc afraid. Choose how many CPU blocs join you (1-5).', blocs: 6, def: [0, 1, 2, 3, 4, 5], pickCount: true },
    second:  { name: 'SECOND STRIKE', sub: 'You are already under attack.', blurb: 'Your forces are deployed and DEFCON 1 has just been declared. Radar shows launches. Survive, decide, respond.', blocs: 2, def: [0, 1], start: 1 },
  };
  const DIFF = {
    recruit:    { name: 'RECRUIT', react: 9, intel: 0.5, coord: 0, salvo: 0.5, think: 2.5 },
    veteran:    { name: 'VETERAN', react: 4, intel: 0.8, coord: 0.5, salvo: 0.8, think: 1.5 },
    strategist: { name: 'STRATEGIST', react: 1.5, intel: 1, coord: 1, salvo: 1, think: 0.8 },
  };
  const PERS = ['hawk', 'cautious', 'opportunist'];

  /* ---------- rng ---------- */
  function RNG(seed) { let a = seed >>> 0 || 1; const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f.range = (lo, hi) => lo + (hi - lo) * f(); f.pick = arr => arr[Math.floor(f() * arr.length)]; return f; }

  /* ---------- geometry (lat/lon degrees) ---------- */
  const vec = (lat, lon) => { const la = lat * D2R, lo = lon * D2R, c = Math.cos(la); return [c * Math.cos(lo), Math.sin(la), c * Math.sin(lo)]; };
  const toLL = v => [Math.asin(Math.max(-1, Math.min(1, v[1]))) * R2D, Math.atan2(v[2], v[0]) * R2D];
  const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function gc(lat1, lon1, lat2, lon2) { return Math.acos(Math.max(-1, Math.min(1, dotv(vec(lat1, lon1), vec(lat2, lon2))))) * R2D; }
  function slerp(a, b, u) {
    const A = vec(a[0], a[1]), B = vec(b[0], b[1]); let d = Math.acos(Math.max(-1, Math.min(1, dotv(A, B))));
    if (d < 1e-6) return [a[0], a[1]];
    const s = Math.sin(d), k1 = Math.sin((1 - u) * d) / s, k2 = Math.sin(u * d) / s;
    return toLL([A[0] * k1 + B[0] * k2, A[1] * k1 + B[1] * k2, A[2] * k1 + B[2] * k2]);
  }
  function stepToward(lat, lon, tl, tn, stepDeg) { const d = gc(lat, lon, tl, tn); if (d <= stepDeg || d < 1e-6) return [tl, tn, true]; const p = slerp([lat, lon], [tl, tn], stepDeg / d); return [p[0], p[1], false]; }

  /* ---------- the 1-degree world grid ---------- */
  const GRID = World ? World.grid : '';
  function cellIdx(lat, lon) { let j = Math.floor(90 - lat); j = j < 0 ? 0 : j > 179 ? 179 : j; let i = Math.floor(lon + 180) % 360; if (i < 0) i += 360; return j * 360 + i; }
  const cellAt = (lat, lon) => GRID[cellIdx(lat, lon)] || '.';
  function landBloc(lat, lon) { const c = cellAt(lat, lon); if (c >= '0' && c <= '5') return +c; if (c === 'n') return 6; return -1; }
  const isWaterC = c => c === '.' || (c >= 'a' && c <= 'f');
  const isWater = (lat, lon) => isWaterC(cellAt(lat, lon));
  function waterOwner(lat, lon) { const c = cellAt(lat, lon); if (c >= 'a' && c <= 'f') return c.charCodeAt(0) - 97; return c === '.' ? -2 : -1; }
  const cellLL = k => [89.5 - Math.floor(k / 360), (k % 360) - 179.5];
  function waterLine(a, b) { const d = gc(a[0], a[1], b[0], b[1]), n = Math.ceil(d / 0.5); for (let s = 1; s < n; s++) { const p = slerp(a, b, s / n); if (!isWater(p[0], p[1])) return false; } return true; }
  /** A* over water cells (8-neighbour, wraps longitude), then line-of-sight smoothing */
  function seaPath(from, to) {
    if (!isWater(to[0], to[1])) return null;
    if (waterLine(from, to)) return [to];
    let s = cellIdx(from[0], from[1]), g = cellIdx(to[0], to[1]);
    if (!isWaterC(GRID[s])) { // ship hugging a coast cell: start from the nearest water cell
      let best = -1, bd = 1e9; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const j = Math.floor(s / 360) + dj, i = (s % 360 + di + 360) % 360; if (j < 0 || j > 179) continue; const k = j * 360 + i; if (isWaterC(GRID[k]) && Math.abs(dj) + Math.abs(di) < bd) { bd = Math.abs(dj) + Math.abs(di); best = k; } }
      if (best < 0) return null; s = best;
    }
    const N = 64800, gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const gl = cellLL(g), h = k => { const p = cellLL(k); return gc(p[0], p[1], gl[0], gl[1]); };
    const heap = []; const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    gs[s] = 0; push(s, h(s)); let found = false, iter = 0;
    while (heap.length && iter++ < 70000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === g) { found = true; break; }
      const j = Math.floor(k / 360), i = k % 360, cl = Math.cos((89.5 - j) * D2R);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!dj && !di) continue; const jj = j + dj; if (jj < 0 || jj > 179) continue;
        const kk = jj * 360 + (i + di + 360) % 360; if (closed[kk] || !isWaterC(GRID[kk])) continue;
        const c = gs[k] + Math.sqrt(dj * dj + di * di * cl * cl);
        if (c < gs[kk]) { gs[kk] = c; came[kk] = k; push(kk, c + h(kk)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = g; k !== -1 && k !== s; k = came[k]) cells.push(cellLL(k)); cells.reverse(); cells.push(to);
    const out = []; let cur = from, i = 0;
    while (i < cells.length) { let j = cells.length - 1; while (j > i && !waterLine(cur, cells[j])) j--; out.push(cells[j]); cur = cells[j]; i = j + 1; }
    return out;
  }

  /* ---------- game ---------- */
  class Game {
    /** opts: { scenario, seed, difficulty, humans:[bloc...], blocs:[bloc...] (active), pers:{bloc:'hawk'..} } */
    constructor(opts) {
      this.opts = opts; this.rng = RNG(opts.seed || 1);
      const sc = this.sc = SCENARIOS[opts.scenario] || SCENARIOS.brink;
      this.diff = DIFF[opts.difficulty] || DIFF.veteran; this.diffKey = opts.difficulty || 'veteran';
      this.active = (opts.blocs || sc.def).slice();
      this.humans = (opts.humans || []).slice();
      this.t = 0; this.defcon = sc.start || 5; this.phaseEnd = sc.start === 1 ? 0 : PHASE[this.defcon]; this.d1At = sc.start === 1 ? 0 : null;
      this.finalAt = null; this.endAt = null; this.over = false; this.result = null; this.speed = 1;
      this.nid = 1; this.units = []; this.missiles = []; this.ints = []; this.air = []; this.sats = []; this.events = []; this.offers = []; this.orders = [];
      this.firstBlood = false; this.detonations = 0;
      this.cities = World.cities.map((c, i) => ({ id: i, name: c[0], lat: c[1], lon: c[2], bloc: c[3], pop0: c[4], pop: c[4] }));
      this.b = BLOCS.map(B => ({ id: B.id, active: this.active.includes(B.id), human: this.humans.includes(B.id), budget: BUDGET,
        deaths: 0, kills: 0, collateral: 0, score: 0, launched: 0, lastIntel: {}, standDownUntil: 0, low: false, lowFired: false,
        sats: 3, allies: [], ceasefire: {}, trust: {}, tension: {}, fear: {}, pers: (opts.pers && opts.pers[B.id]) || null, alertUntil: 0 }));
      for (const b of this.b) { b.pop0 = this.cities.filter(c => c.bloc === b.id).reduce((s, c) => s + c.pop0, 0); b.pop = b.pop0; for (const o of BLOCS) { b.trust[o.id] = 0; b.tension[o.id] = 20; b.fear[o.id] = 20; } }
      this.ai = [];
      const AI = Game.AI;
      for (const id of this.active) if (!this.humans.includes(id) && AI) {
        const p = this.b[id].pers || this.rng.pick(PERS); this.b[id].pers = p; this.ai.push(new AI(this, id, p, this.diff));
      }
      if (sc.start === 1) this.setupSecondStrike();
    }
    ev(e, to) { e.t = this.t; e.to = to || null; this.events.push(e); }
    news(text, to, kind) { this.ev({ type: 'news', text, kind: kind || 'info' }, to); }
    hostile(a, b) { return a !== b && this.b[a].active && this.b[b].active && !this.b[a].allies.includes(b); }
    unit(id) { return this.units.find(u => u.id === id); }

    /* ----- placement ----- */
    canPlace(bloc, type, lat, lon) {
      const U = UNIT[type], B = this.b[bloc]; if (!U) return 'Unknown unit';
      if (this.defcon < 4 && !this._deploying) return 'Deployment closed after DEFCON 4';
      if (B.budget < U.cost) return 'Not enough budget';
      if (this.units.filter(u => u.bloc === bloc && u.type === type).length >= U.max) return 'Limit reached for ' + U.name;
      if (U.land) { if (landBloc(lat, lon) !== bloc) return 'Must be inside your territory'; }
      else if (waterOwner(lat, lon) !== bloc) return 'Must be in your territorial waters';
      for (const u of this.units) if (u.bloc === bloc && gc(u.lat, u.lon, lat, lon) < 1.2) return 'Too close to another unit';
      return null;
    }
    place(bloc, type, lat, lon) {
      const err = this.canPlace(bloc, type, lat, lon); if (err) return { ok: false, msg: err };
      const U = UNIT[type]; this.b[bloc].budget -= U.cost;
      const u = { id: this.nid++, type, bloc, lat, lon, alive: true, mode: type === 'silo' ? 'def' : null, modeAt: 0, cd: 0,
        wh: U.wh || 0, abm: U.abm || 0, fi: U.fi || 0, bo: U.bo || 0, path: null, rev: {}, seen: {} };
      this.units.push(u); this.ev({ type: 'place', id: u.id, utype: type, lat, lon }, [bloc]); return { ok: true, id: u.id };
    }
    remove(bloc, id) { const u = this.unit(id); if (!u || u.bloc !== bloc || this.defcon < 4) return { ok: false, msg: 'Cannot remove now' }; this.units.splice(this.units.indexOf(u), 1); this.b[bloc].budget += UNIT[u.type].cost; return { ok: true }; }

    setupSecondStrike() {
      // everybody gets an AI-quality deployment; then the enemy's first strike is already under way
      const AI = Game.AI; this._deploying = true;
      for (const id of this.active) AI.autoDeploy(this, id, this.b[id].pers || 'hawk');
      this._deploying = false;
      for (const u of this.units) if (u.type === 'silo' && !this.humans.includes(u.bloc)) { u.mode = 'launch'; }
      for (const a of this.ai) { a.forceStrikeAt = 6; a.pers = 'hawk'; this.b[a.bloc].pers = 'hawk'; }
      for (const b of this.b) for (const o of BLOCS) b.tension[o.id] = 90;
      this.news('DEFCON 1. Unconfirmed launch reports. All forces at maximum readiness.', null, 'alert');
    }

    /* ----- commands (every human action goes through here; the host validates guest commands the same way) ----- */
    command(bloc, c) {
      const B = this.b[bloc]; if (!B || !B.active || this.over) return { ok: false, msg: 'No' };
      switch (c.op) {
        case 'place': return this.place(bloc, c.type, c.lat, c.lon);
        case 'remove': return this.remove(bloc, c.id);
        case 'mode': { const u = this.unit(c.id); if (!u || u.bloc !== bloc || u.type !== 'silo' || !u.alive) return { ok: false, msg: 'No silo' };
          if (c.mode === 'launch' && B.standDownUntil > this.t) return { ok: false, msg: 'Stand-down pledge in force' };
          if (u.mode === c.mode || u.pend === c.mode) return { ok: true };
          u.pend = c.mode; u.modeAt = this.t + (this.defcon <= 3 ? 20 : 1); return { ok: true, msg: 'Switching to ' + (c.mode === 'def' ? 'DEFENSE' : 'LAUNCH') + ' mode' }; }
        case 'move': { const u = this.unit(c.id); if (!u || u.bloc !== bloc || !u.alive || UNIT[u.type].land) return { ok: false, msg: 'Select a ship' };
          if (this.defcon > 3) return { ok: false, msg: 'Fleets may sail from DEFCON 3' };
          const p = seaPath([u.lat, u.lon], [c.lat, c.lon]); if (!p) return { ok: false, msg: 'No sea route there' }; u.path = p; return { ok: true }; }
        case 'launch': return this.launchFrom(bloc, c.id, c.lat, c.lon);
        case 'air': return this.launchAir(bloc, c.id, c.kind, c.lat, c.lon);
        case 'recall': { const a = this.air.find(a => a.id === c.id); if (!a || a.bloc !== bloc) return { ok: false, msg: 'No aircraft' }; a.state = 'return'; return { ok: true, msg: 'Recalled' }; }
        case 'strike': return this.strikePackage(bloc, c.target, c.pkg, c.count, !!c.sync);
        case 'sat': return this.spySat(bloc, c.lat, c.lon);
        case 'diplo': return this.diplo(bloc, c.act, c.target);
        case 'respond': return this.respond(bloc, c.id, c.accept);
        case 'low': B.low = !!c.on; return { ok: true, msg: 'Launch on warning ' + (B.low ? 'ARMED' : 'off') };
        case 'cancel': this.orders = this.orders.filter(o => !(o.bloc === bloc)); return { ok: true, msg: 'Pending launches cancelled' };
      }
      return { ok: false, msg: 'Unknown order' };
    }
    validTarget(bloc, lat, lon) {
      const lb = landBloc(lat, lon);
      if (lb === bloc || (lb >= 0 && lb < 6 && this.b[bloc].allies.includes(lb))) return 'Cannot target your own or allied territory';
      if (lb >= 0 && lb < 6 && !this.b[lb].active) return 'Non-aligned territory: off limits';
      if (lb === 6) return 'Non-aligned territory: off limits';
      return null;
    }
    launchFrom(bloc, id, lat, lon, viaOrder) {
      const u = this.unit(id); if (!u || u.bloc !== bloc || !u.alive) return { ok: false, msg: 'No launcher' };
      if (this.defcon > 1) return { ok: false, msg: 'Launches are authorised only at DEFCON 1' };
      if (u.type !== 'silo' && u.type !== 'sub') return { ok: false, msg: 'Not a missile launcher' };
      if (u.type === 'silo' && (u.mode !== 'launch' || u.pend)) return { ok: false, msg: 'Silo must be in LAUNCH mode' };
      if (u.wh <= 0) return { ok: false, msg: 'No warheads left' };
      const err = this.validTarget(bloc, lat, lon); if (err) return { ok: false, msg: err };
      if (u.cd > this.t) return { ok: false, msg: 'Reloading', busy: true };
      u.wh--; u.cd = this.t + (u.type === 'silo' ? 5 : 7);
      const ang = gc(u.lat, u.lon, lat, lon), kind = u.type === 'silo' ? 'icbm' : 'slbm';
      const dur = kind === 'icbm' ? 35 + 55 * ang / 180 : 20 + 45 * ang / 180;
      this.fire(bloc, kind, [u.lat, u.lon], [lat, lon], dur, u.id);
      // launching gives the position away
      for (const o of this.active) u.rev[o] = u.type === 'silo' ? Infinity : Math.max(u.rev[o] || 0, this.t + 120);
      return { ok: true };
    }
    fire(bloc, kind, from, to, dur, src) {
      const m = { id: this.nid++, bloc, kind, from, to, t0: this.t, dur, alive: true, shots: 0, src, tb: landBloc(to[0], to[1]), alt: kind === 'cruise' ? 0.006 : 0.05 + 0.22 * gc(from[0], from[1], to[0], to[1]) / 180 };
      this.missiles.push(m); this.b[bloc].launched++;
      if (!this.firstLaunch) { this.firstLaunch = true; this.ev({ type: 'first', bloc }); }
      this.ev({ type: 'launch', id: m.id, bloc, kind, lat: from[0], lon: from[1] });
      const reg = landBloc(from[0], from[1]); const where = reg >= 0 && reg < 6 ? BLOCS[reg].name + ' territory' : 'open ocean';
      if (!this._lastLaunchNews || this.t - this._lastLaunchNews > 6) { this._lastLaunchNews = this.t; this.news('LAUNCH DETECTED: ' + (kind === 'cruise' ? 'air-launched weapon' : 'ballistic missile') + ' from ' + where, null, 'alert'); }
      // tension: everybody hates a launcher; the targeted bloc goes to war
      for (const o of this.active) if (o !== bloc) { this.b[o].tension[bloc] = Math.min(100, this.b[o].tension[bloc] + 8); this.b[o].trust[bloc] -= 5; }
      if (m.tb >= 0 && m.tb < 6) { this.b[m.tb].tension[bloc] = 100; for (const k of Object.keys(this.b[bloc].ceasefire)) if (+k === m.tb) this.breakCeasefire(bloc, m.tb); }
      return m;
    }
    launchAir(bloc, id, kind, lat, lon) {
      const u = this.unit(id); if (!u || u.bloc !== bloc || !u.alive) return { ok: false, msg: 'No base' };
      if (this.defcon > 3) return { ok: false, msg: 'Air operations start at DEFCON 3' };
      if (kind === 'fighter' && u.fi <= 0) return { ok: false, msg: 'No fighters left' };
      if (kind === 'bomber' && (u.bo <= 0 || u.type !== 'airbase')) return { ok: false, msg: 'No bombers here' };
      if (u.cd > this.t) return { ok: false, msg: 'Readying aircraft', busy: true };
      const A = AIR[kind], d = gc(u.lat, u.lon, lat, lon);
      if (kind === 'fighter' && d > A.fuel * A.speed * 0.5) return { ok: false, msg: 'Out of fighter range (' + Math.round(A.fuel * A.speed * 0.5) + '°)' };
      if (kind === 'fighter') u.fi--; else u.bo--;
      u.cd = this.t + 3;
      const a = { id: this.nid++, kind, bloc, home: u.id, lat: u.lat, lon: u.lon, dest: [lat, lon], state: 'out', fuel: A.fuel, wh: kind === 'bomber' ? 1 : 0, hdg: 0, rev: {} };
      this.air.push(a); this.ev({ type: 'air', id: a.id, kind }, [bloc]); return { ok: true, id: a.id };
    }
    spySat(bloc, lat, lon) {
      const B = this.b[bloc]; if (this.defcon > 2) return { ok: false, msg: 'Satellite tasking opens at DEFCON 2' };
      if (B.sats <= 0) return { ok: false, msg: 'No satellite passes left' };
      B.sats--; this.sats.push({ id: this.nid++, bloc, lat, lon, r: 16, until: this.t + 45 });
      const tb = landBloc(lat, lon); if (tb >= 0 && tb < 6) B.lastIntel[tb] = this.t;
      this.ev({ type: 'sat', lat, lon }, [bloc]); return { ok: true, msg: 'Reconnaissance satellite tasked' };
    }

    /* ----- diplomacy ----- */
    diplo(bloc, act, target) {
      const B = this.b[bloc], T = this.b[target];
      if (act !== 'standdown' && (!T || !T.active || target === bloc)) return { ok: false, msg: 'Choose another bloc' };
      const name = BLOCS[bloc].name;
      if (act === 'alliance') {
        if (B.allies.includes(target)) return { ok: false, msg: 'Already allied' };
        if (this.active.length < 3) return { ok: false, msg: 'An alliance needs a third bloc' };
        if (T.human) { this.offer(bloc, target, 'alliance'); return { ok: true, msg: 'Proposal sent' }; }
        const ai = this.ai.find(a => a.bloc === target), yes = ai && ai.wantsAlliance(bloc);
        setTimeoutish(this, 3, () => { if (yes) this.ally(bloc, target); else this.news(BLOCS[target].name + ' declines an alliance with ' + name + '.', null, 'diplo'); });
        return { ok: true, msg: 'Envoys dispatched…' };
      }
      if (act === 'ceasefire') {
        if (this.defcon > 3) return { ok: false, msg: 'There is no fighting to stop yet' };
        if (B.ceasefire[target] > this.t) return { ok: false, msg: 'Ceasefire already in force' };
        if (T.human) { this.offer(bloc, target, 'ceasefire'); return { ok: true, msg: 'Proposal sent' }; }
        const ai = this.ai.find(a => a.bloc === target), yes = ai && ai.wantsCeasefire(bloc);
        setTimeoutish(this, 3, () => { if (yes) this.ceasefire(bloc, target); else { this.news(BLOCS[target].name + ' rejects a ceasefire with ' + name + '.', null, 'diplo'); } });
        return { ok: true, msg: 'Hotline open…' };
      }
      if (act === 'force') { // show of force: reveal two of your strongest assets to them
        const mine = this.units.filter(u => u.bloc === bloc && u.alive && (u.type === 'silo' || u.type === 'carrier'));
        for (const u of mine.slice(0, 2)) u.rev[target] = Math.max(u.rev[target] || 0, this.t + 60);
        T.fear[bloc] = Math.min(100, T.fear[bloc] + 25); T.tension[bloc] = Math.min(100, T.tension[bloc] + (T.pers === 'hawk' ? 15 : 5));
        this.news(name + ' stages a show of force aimed at the ' + BLOCS[target].name + '.', null, 'diplo');
        return { ok: true, msg: 'Assets displayed. They are afraid, and angrier.' };
      }
      if (act === 'bluff') {
        const caught = (B.lastIntelOn = B.lastIntelOn || {}, T.lastIntel[bloc] !== undefined && this.t - T.lastIntel[bloc] < 150) || this.rng() < 0.15;
        if (caught) { T.trust[bloc] -= 30; T.tension[bloc] = Math.min(100, T.tension[bloc] + 20); this.news(BLOCS[target].name + ' intelligence calls ' + name + "'s bluff.", null, 'diplo'); return { ok: true, msg: 'Bluff exposed. Trust collapses.' }; }
        T.fear[bloc] = Math.min(100, T.fear[bloc] + 30); this.news(name + ' announces its forces are at maximum alert.', null, 'diplo');
        return { ok: true, msg: 'They believe you. For now.' };
      }
      if (act === 'standdown') {
        B.standDownUntil = this.t + 90;
        for (const u of this.units) if (u.bloc === bloc && u.type === 'silo' && (u.mode === 'launch' || u.pend === 'launch')) { u.pend = 'def'; u.modeAt = this.t + 5; }
        for (const o of this.b) if (o.id !== bloc) { o.tension[bloc] = Math.max(0, o.tension[bloc] - 20); o.trust[bloc] += 10; }
        this.news(name + ' pledges to stand down its missile forces.', null, 'diplo');
        return { ok: true, msg: 'Silos locked in defense for 90 s. Tension eases.' };
      }
      return { ok: false, msg: 'Unknown action' };
    }
    offer(from, to, kind) { const o = { id: this.nid++, from, to, kind, until: this.t + 30 }; this.offers.push(o); this.ev({ type: 'offer', id: o.id, from, kind }, [to]); }
    respond(bloc, id, accept) {
      const o = this.offers.find(o => o.id === id && o.to === bloc); if (!o) return { ok: false, msg: 'Offer expired' };
      this.offers.splice(this.offers.indexOf(o), 1);
      if (accept) { if (o.kind === 'alliance') this.ally(o.from, o.to); else this.ceasefire(o.from, o.to); }
      else this.news(BLOCS[bloc].name + ' turns down the ' + BLOCS[o.from].name + "'s " + o.kind + ' offer.', null, 'diplo');
      return { ok: true };
    }
    ally(a, b) { const A = this.b[a], B = this.b[b]; if (!A.allies.includes(b)) A.allies.push(b); if (!B.allies.includes(a)) B.allies.push(a); A.trust[b] += 20; B.trust[a] += 20; A.tension[b] = B.tension[a] = 0; this.news(BLOCS[a].name + ' and ' + BLOCS[b].name + ' sign a mutual defence pact.', null, 'diplo'); this.ev({ type: 'ally', a, b }); }
    ceasefire(a, b) { const until = this.t + 150; this.b[a].ceasefire[b] = until; this.b[b].ceasefire[a] = until; this.b[a].tension[b] = Math.max(0, this.b[a].tension[b] - 25); this.b[b].tension[a] = Math.max(0, this.b[b].tension[a] - 25); this.news('CEASEFIRE: ' + BLOCS[a].name + ' and ' + BLOCS[b].name + ' agree to hold fire.', null, 'diplo'); this.ev({ type: 'ceasefire', a, b }); for (const ai of this.ai) if (ai.bloc === a || ai.bloc === b) ai.onCeasefire(ai.bloc === a ? b : a); }
    breakCeasefire(a, b) { if (!(this.b[a].ceasefire[b] > this.t)) return; this.b[a].ceasefire[b] = 0; this.b[b].ceasefire[a] = 0; for (const o of this.b) if (o.id !== a) o.trust[a] -= 25; this.news(BLOCS[a].name + ' BREAKS the ceasefire with ' + BLOCS[b].name + '.', null, 'alert'); }

    /* ----- strike packages (shared by the human Enter panel and the AI) ----- */
    targetsFor(bloc, target, pkg) {
      const known = this.knownUnits(bloc).filter(u => u.bloc === target);
      const cities = this.cities.filter(c => c.bloc === target && c.pop > 0.05).sort((a, b) => b.pop - a.pop);
      const T = [];
      const cf = known.filter(u => u.type === 'silo').concat(known.filter(u => u.type === 'radar' || u.type === 'airbase'));
      const def = known.filter(u => u.type === 'sam');
      if (pkg === 'counterforce') { for (const u of cf) T.push([u.lat, u.lon, 'unit']); }
      else if (pkg === 'defense') { for (const u of def) T.push([u.lat, u.lon, 'unit']); for (const c of cities.slice(0, 4)) T.push([c.lat, c.lon, 'city']); }
      else if (pkg === 'countervalue') { for (const c of cities) T.push([c.lat, c.lon, 'city']); }
      else { for (const u of cf) T.push([u.lat, u.lon, 'unit']); for (const u of def.slice(0, 3)) T.push([u.lat, u.lon, 'unit']); for (const c of cities) T.push([c.lat, c.lon, 'city']); }
      if (!T.length) for (const c of cities) T.push([c.lat, c.lon, 'city']);
      return T;
    }
    strikePackage(bloc, target, pkg, count, sync) {
      if (this.defcon > 1) return { ok: false, msg: 'Strike packages need DEFCON 1' };
      if (!this.hostile(bloc, target)) return { ok: false, msg: 'Not a hostile bloc' };
      const launchers = this.units.filter(u => u.bloc === bloc && u.alive && u.wh > 0 && (u.type === 'sub' || u.type === 'silo'));
      if (!launchers.length) return { ok: false, msg: 'No warheads left' };
      const T = this.targetsFor(bloc, target, pkg); if (!T.length) return { ok: false, msg: 'No known targets' };
      // silos needed in launch mode
      const avail = launchers.reduce((s, u) => s + u.wh, 0); count = Math.max(1, Math.min(count || avail, avail));
      let n = 0; const plan = [];
      const slots = []; for (const u of launchers) for (let k = 0; k < u.wh; k++) slots.push(u);
      // subs first (they're already hidden at sea and fast), then silos
      slots.sort((a, b) => (a.type === 'sub' ? 0 : 1) - (b.type === 'sub' ? 0 : 1));
      for (let i = 0; i < count; i++) { const tg = T[i % T.length]; const u = slots.shift(); if (!u) break;
        const jit = tg[2] === 'city' ? (this.rng() - 0.5) * 0.6 : 0; plan.push({ u, lat: tg[0] + jit, lon: tg[1] + jit }); n++; }
      for (const p of plan) if (p.u.type === 'silo' && p.u.mode !== 'launch' && p.u.pend !== 'launch') this.command(bloc, { op: 'mode', id: p.u.id, mode: 'launch' });
      // timing: sync = arrange launches so the warheads land together (saturating defences)
      let base = this.t;
      const durOf = p => { const ang = gc(p.u.lat, p.u.lon, p.lat, p.lon); return p.u.type === 'silo' ? 35 + 55 * ang / 180 : 20 + 45 * ang / 180; };
      const ready = p => p.u.type === 'silo' ? Math.max(this.t, p.u.pend ? p.u.modeAt : this.t) : this.t;
      const perUnit = {}; for (const p of plan) { perUnit[p.u.id] = (perUnit[p.u.id] || 0) + 1; p.k = perUnit[p.u.id] - 1; }
      if (sync) { let impact = 0; for (const p of plan) impact = Math.max(impact, ready(p) + p.k * (p.u.type === 'silo' ? 5.2 : 7.2) + durOf(p)); for (const p of plan) this.orders.push({ bloc, id: p.u.id, lat: p.lat, lon: p.lon, at: impact - durOf(p) - 0.1 }); }
      else for (const p of plan) this.orders.push({ bloc, id: p.u.id, lat: p.lat, lon: p.lon, at: base });
      this.ev({ type: 'package', n, target, pkg }, [bloc]);
      return { ok: true, msg: n + ' warheads assigned to ' + BLOCS[target].name + (sync ? ' (simultaneous impact)' : ''), n };
    }

    /* ----- knowledge / fog of war ----- */
    sensors(bloc) {
      // every sensor bubble this bloc (and its allies) has right now: [lat, lon, radius, kind]
      const team = [bloc].concat(this.b[bloc].allies), S = [];
      for (const u of this.units) if (u.alive && team.includes(u.bloc)) {
        const U = UNIT[u.type]; S.push([u.lat, u.lon, U.radar || U.sight, U.radar ? 'radar' : 'sight']);
        if (U.sonar) S.push([u.lat, u.lon, U.sonar, 'sonar']);
      }
      for (const a of this.air) if (team.includes(a.bloc)) S.push([a.lat, a.lon, AIR[a.kind].sight, 'sight']);
      for (const s of this.sats) if (team.includes(s.bloc) && s.until > this.t) S.push([s.lat, s.lon, s.r, 'sat']);
      return S;
    }
    canSee(bloc, lat, lon, sub, S) {
      for (const s of S) { if (sub ? s[3] !== 'sonar' && s[3] !== 'sat' : s[3] === 'sonar') continue; if (sub && s[3] === 'sat') continue; if (gc(s[0], s[1], lat, lon) <= s[2]) return true; }
      return false;
    }
    visibleUnit(bloc, u, S) {
      if (u.bloc === bloc || this.b[bloc].allies.includes(u.bloc)) return true;
      if ((u.rev[bloc] || 0) > this.t) return true;
      return this.canSee(bloc, u.lat, u.lon, u.type === 'sub', S);
    }
    /** what this bloc knows about other blocs' units (visible now + remembered last positions of land units) */
    knownUnits(bloc) { return this.units.filter(u => u.alive && u.bloc !== bloc && (u.seen[bloc] !== undefined || (u.rev[bloc] || 0) > this.t)); }
    updateVision() {
      for (const b of this.active) {
        const S = this.sensors(b);
        for (const u of this.units) if (u.alive && u.bloc !== b) { if (this.visibleUnit(b, u, S)) { if (u.seen[b] === undefined) this.ev({ type: 'spotted', id: u.id, utype: u.type, bloc: u.bloc }, [b]); u.seen[b] = this.t; } else if (!UNIT[u.type].land) delete u.seen[b]; }
        this.b[b]._S = S;
      }
    }
    missileVisible(bloc, m) {
      if (m.bloc === bloc || this.b[bloc].allies.includes(m.bloc)) return true;
      const p = this.missilePos(m, this.t); return this.canSee(bloc, p[0], p[1], false, (this.b[bloc]._S || []).filter(s => s[3] !== 'sight' || s[2] >= 6));
    }
    missilePos(m, t) { const u = Math.max(0, Math.min(1, (t - m.t0) / m.dur)); return slerp(m.from, m.to, u); }

    /* ----- the clock ----- */
    step(dt) {
      if (this.over) return;
      const t0 = this.t; this.t += dt;
      // DEFCON transitions
      if (this.defcon > 1 && this.t >= this.phaseEnd) {
        this.defcon--; this.ev({ type: 'defcon', defcon: this.defcon });
        const msg = { 4: 'DEFCON 4. Deployment continues. Intelligence on alert.', 3: 'DEFCON 3. Fleets and air wings cleared to move. Conventional engagements authorised.', 2: 'DEFCON 2. Reconnaissance satellites and the diplomatic hotline are open.', 1: 'DEFCON 1. Nuclear release authorised. Launch only if you must.' }[this.defcon];
        this.news(msg, null, this.defcon <= 2 ? 'alert' : 'info');
        if (this.defcon > 1) this.phaseEnd = this.t + PHASE[this.defcon]; else this.d1At = this.t;
        if (this.defcon === 3) for (const u of this.units) if (u.type === 'silo' && u.pend) { u.mode = u.pend; u.pend = null; }
      }
      // silo mode switches
      for (const u of this.units) if (u.pend && this.t >= u.modeAt) { u.mode = u.pend; u.pend = null; this.ev({ type: 'mode', id: u.id, mode: u.mode }, [u.bloc]); }
      // timed AI callbacks
      if (this._timers) { const due = this._timers.filter(x => x.at <= this.t); this._timers = this._timers.filter(x => x.at > this.t); for (const x of due) x.f(); }
      // ships
      for (const u of this.units) if (u.alive && u.path && u.path.length) {
        const sp = UNIT[u.type].speed * dt, w = u.path[0], r = stepToward(u.lat, u.lon, w[0], w[1], sp);
        u.lat = r[0]; u.lon = r[1]; if (r[2]) u.path.shift(); if (!u.path.length) u.path = null;
      }
      // standing launch orders
      if (this.orders.length) {
        const keep = [];
        for (const o of this.orders) {
          if (o.at > this.t) { keep.push(o); continue; }
          const u = this.unit(o.id); if (!u || !u.alive || u.wh <= 0) continue;
          const r = this.launchFrom(o.bloc, o.id, o.lat, o.lon, true);
          if (!r.ok && (r.busy || (u.type === 'silo' && (u.pend === 'launch' || (u.mode === 'launch' && u.cd > this.t))))) { o.at = Math.max(this.t + 0.2, u.cd); keep.push(o); }
          else if (!r.ok && u.type === 'silo' && u.mode !== 'launch' && !u.pend && this.defcon === 1) { this.command(o.bloc, { op: 'mode', id: u.id, mode: 'launch' }); keep.push(o); }
        }
        this.orders = keep;
      }
      this.stepAir(dt);
      this.stepMissiles();
      this.stepDefense();
      this.stepSkirmish(dt);
      if (Math.floor(t0 * 2) !== Math.floor(this.t * 2)) this.updateVision();
      // launch on warning (humans arm it from the side panel; the AI has its own doctrine)
      for (const b of this.humans) { const B = this.b[b]; if (!B.low || B.lowFired || this.defcon > 1) continue; const inc = this.incomingTo(b); if (inc.length) { B.lowFired = true; const src = inc[0].bloc; const r = this.strikePackage(b, src, 'full', 0, false); this.news(BLOCS[b].name + ': LAUNCH ON WARNING executed.', null, 'alert'); this.ev({ type: 'low', bloc: b, n: r.n || 0 }, [b]); } }
      for (const ai of this.ai) ai.update(dt);
      // offers expire
      this.offers = this.offers.filter(o => o.until > this.t);
      this.sats = this.sats.filter(s => s.until > this.t);
      // tension drift: forward-deployed enemy fleets near your coast raise it
      if (Math.floor(t0) !== Math.floor(this.t)) this.tensionTick();
      this.checkEnd();
    }
    incomingTo(b) { return this.missiles.filter(m => m.alive && m.tb === b && this.hostile(m.bloc, b) && this.missileVisible(b, m)); }
    tensionTick() {
      for (const b of this.active) { const B = this.b[b]; const S = B._S || [];
        for (const u of this.units) if (u.alive && u.bloc !== b && !UNIT[u.type].land && u.seen[b] !== undefined) {
          const near = this.cities.some(c => c.bloc === b && gc(c.lat, c.lon, u.lat, u.lon) < 15); if (near) B.tension[u.bloc] = Math.min(100, B.tension[u.bloc] + 0.4);
        }
        for (const o of this.active) if (o !== b) B.fear[o] = Math.max(0, B.fear[o] - 0.05);
      }
    }

    stepAir(dt) {
      for (const a of this.air) {
        if (!a.alive && a.alive !== undefined) continue;
        const A = AIR[a.kind]; a.fuel -= dt;
        const home = this.unit(a.home);
        let dest = a.dest;
        if (a.state === 'return' || a.fuel < (home ? gc(a.lat, a.lon, home.lat, home.lon) / A.speed + 4 : 0)) { a.state = 'return'; }
        if (a.state === 'return') {
          let h = home && home.alive ? home : null;
          if (!h) { let bd = 1e9; for (const u of this.units) if (u.alive && u.bloc === a.bloc && (u.type === 'airbase' || u.type === 'carrier')) { const d = gc(a.lat, a.lon, u.lat, u.lon); if (d < bd) { bd = d; h = u; } } if (h) a.home = h.id; }
          if (!h) { a.alive = false; this.ev({ type: 'crash', id: a.id }); continue; }
          dest = [h.lat, h.lon];
        }
        if (a.fuel <= 0) { a.alive = false; this.ev({ type: 'crash', id: a.id }, [a.bloc]); continue; }
        if (a.state === 'patrol') { // circle the destination
          a.orbit = (a.orbit || 0) + dt * 0.5; dest = [a.dest[0] + Math.sin(a.orbit) * 1.5, a.dest[1] + Math.cos(a.orbit) * 1.5 / Math.max(0.2, Math.cos(a.dest[0] * D2R))];
        }
        const r = stepToward(a.lat, a.lon, dest[0], dest[1], A.speed * dt);
        a.hdg = Math.atan2(r[1] - a.lon, r[0] - a.lat); a.lat = r[0]; a.lon = r[1];
        if (r[2]) {
          if (a.state === 'return') { const h = this.unit(a.home); if (h) { if (a.kind === 'fighter') h.fi++; else { h.bo++; } } a.alive = false; a.landed = true; continue; }
          if (a.state === 'out') a.state = 'patrol';
        }
        // bombers: release a stand-off weapon when in range of a target at DEFCON 1
        if (a.kind === 'bomber' && a.wh > 0 && this.defcon === 1 && a.state !== 'return' && gc(a.lat, a.lon, a.dest[0], a.dest[1]) <= A.release && !this.validTarget(a.bloc, a.dest[0], a.dest[1])) {
          a.wh = 0; const ang = gc(a.lat, a.lon, a.dest[0], a.dest[1]); this.fire(a.bloc, 'cruise', [a.lat, a.lon], a.dest.slice(), 6 + ang / 0.4, a.id); a.state = 'return';
          for (const o of this.active) a.rev[o] = this.t + 30;
        }
      }
      this.air = this.air.filter(a => a.alive !== false);
    }
    stepMissiles() {
      for (const m of this.missiles) if (m.alive && this.t >= m.t0 + m.dur) { m.alive = false; this.detonate(m); }
      for (const i of this.ints) if (i.alive && this.t >= i.t0 + i.dur) {
        i.alive = false; const tgt = i.tm ? this.missiles.find(m => m.id === i.tgt) : this.air.find(a => a.id === i.tgt);
        if (!tgt || (i.tm && !tgt.alive)) continue;
        if (this.rng() < i.pk) {
          if (i.tm) { tgt.alive = false; tgt.killed = true; const p = this.missilePos(tgt, this.t); this.ev({ type: 'intercept', id: tgt.id, lat: p[0], lon: p[1], by: i.bloc }); if (this.humans.includes(i.bloc)) this.b[i.bloc].intercepts = (this.b[i.bloc].intercepts || 0) + 1; }
          else { tgt.alive = false; this.ev({ type: 'downed', id: tgt.id, kind: tgt.kind, lat: tgt.lat, lon: tgt.lon, by: i.bloc }); }
        } else this.ev({ type: 'miss', id: tgt.id, by: i.bloc, lat: i.to[0], lon: i.to[1] });
      }
      this.missiles = this.missiles.filter(m => m.alive || this.t - m.t0 - m.dur < 1);
      this.ints = this.ints.filter(i => i.alive);
      this.air = this.air.filter(a => a.alive !== false);
    }
    /** interceptors: batteries, silos in DEFENSE mode and carrier groups shoot at tracked hostile missiles in their terminal phase */
    stepDefense() {
      const ms = this.missiles.filter(m => m.alive);
      for (const u of this.units) {
        if (!u.alive || u.abm <= 0 || u.cd > this.t) continue;
        const U = UNIT[u.type]; if (!U.abmRange) continue;
        if (u.type === 'silo' && (u.mode !== 'def' || u.pend)) continue;
        let best = null, bs = -1e9;
        for (const m of ms) {
          if (!this.hostile(m.bloc, u.bloc) || m.shots >= 3) continue;
          const uu = (this.t - m.t0) / m.dur; if (m.kind !== 'cruise' && uu < 0.6) continue;
          const left = m.t0 + m.dur - this.t; if (left < 1.6) continue;
          const p = this.missilePos(m, this.t); if (gc(p[0], p[1], u.lat, u.lon) > U.abmRange) continue;
          if (!this.missileVisible(u.bloc, m)) continue;
          // prefer the warhead closest to impact that lands nearest to us
          const s = -left - gc(m.to[0], m.to[1], u.lat, u.lon) * 0.5 - m.shots * 6;
          if (s > bs) { bs = s; best = m; }
        }
        if (best) { this.shoot(u, best, true, U.abmPk); u.abm--; u.cd = this.t + U.abmCd; continue; }
        // anti-air (DEFCON 3+)
        if (this.defcon <= 3 && U.aaRange) for (const a of this.air) {
          if (!this.hostile(a.bloc, u.bloc) || a.shot > this.t) continue;
          if (gc(a.lat, a.lon, u.lat, u.lon) > U.aaRange) continue;
          if (this.b[u.bloc].ceasefire[a.bloc] > this.t) continue;
          this.shoot(u, a, false, U.aaPk); a.shot = this.t + 2.2; u.abm--; u.cd = this.t + U.abmCd; this.reveal(u, a.bloc, 40); break;
        }
      }
    }
    shoot(u, tgt, isMissile, pk) {
      const to = isMissile ? this.missilePos(tgt, this.t + 1.6) : [tgt.lat, tgt.lon];
      const i = { id: this.nid++, bloc: u.bloc, from: [u.lat, u.lon], to, t0: this.t, dur: 1.6, tm: isMissile, tgt: tgt.id, pk, alive: true };
      if (isMissile) tgt.shots++;
      this.ints.push(i); this.ev({ type: 'ifire', id: i.id, bloc: u.bloc, lat: u.lat, lon: u.lon });
    }
    reveal(u, to, s) { u.rev[to] = Math.max(u.rev[to] || 0, this.t + s); }
    /** conventional skirmishes from DEFCON 3: fighters, carriers. Every engagement reveals both sides. */
    stepSkirmish(dt) {
      if (this.defcon > 3) return;
      this._sk = (this._sk || 0) + dt; if (this._sk < 1) return; this._sk = 0;
      for (const a of this.air) if (a.kind === 'fighter' && a.alive !== false) {
        for (const o of this.air) if (o.bloc !== a.bloc && this.hostile(a.bloc, o.bloc) && o.alive !== false && !(this.b[a.bloc].ceasefire[o.bloc] > this.t) && gc(a.lat, a.lon, o.lat, o.lon) < AIR.fighter.aaRange) {
          if (this.rng() < AIR.fighter.aaPk * (o.kind === 'bomber' ? 1.2 : 1)) { o.alive = false; this.ev({ type: 'downed', id: o.id, kind: o.kind, lat: o.lat, lon: o.lon, by: a.bloc }); this.news(BLOCS[a.bloc].name + ' fighters shoot down a ' + BLOCS[o.bloc].name + ' ' + o.kind + '.', null, 'combat'); }
          break;
        }
        // strafing runs on ships
        for (const u of this.units) if (u.alive && !UNIT[u.type].land && this.hostile(a.bloc, u.bloc) && !(this.b[a.bloc].ceasefire[u.bloc] > this.t) && u.type !== 'sub' && gc(a.lat, a.lon, u.lat, u.lon) < 1.5) {
          this.reveal(u, a.bloc, 60); if (this.rng() < 0.03) this.destroyUnit(u, a.bloc, 'air attack'); break; }
      }
      for (const u of this.units) if (u.alive && u.type === 'carrier') {
        for (const o of this.units) if (o.alive && !UNIT[o.type].land && this.hostile(u.bloc, o.bloc) && !(this.b[u.bloc].ceasefire[o.bloc] > this.t)) {
          const d = gc(u.lat, u.lon, o.lat, o.lon); if (d > 3) continue;
          if (o.type === 'sub' && d > UNIT.carrier.sonar) continue;
          this.reveal(o, u.bloc, 60); this.reveal(u, o.bloc, 60);
          if (!this._skNews || this.t - this._skNews > 20) { this._skNews = this.t; this.news('Naval engagement: ' + BLOCS[u.bloc].name + ' and ' + BLOCS[o.bloc].name + ' fleets exchange fire.', null, 'combat'); this.ev({ type: 'skirmish', lat: (u.lat + o.lat) / 2, lon: (u.lon + o.lon) / 2 }); }
          for (const b of [u.bloc, o.bloc]) this.b[b].tension[b === u.bloc ? o.bloc : u.bloc] = Math.min(100, this.b[b].tension[b === u.bloc ? o.bloc : u.bloc] + 1.5);
          if (this.rng() < (o.type === 'sub' ? 0.1 : 0.06)) this.destroyUnit(o, u.bloc, 'naval action');
          break;
        }
      }
    }
    destroyUnit(u, by, why) {
      if (!u.alive) return; u.alive = false; u.dead = this.t;
      this.ev({ type: 'destroyed', id: u.id, utype: u.type, bloc: u.bloc, lat: u.lat, lon: u.lon, by, why });
      for (const a of this.air) if (a.home === u.id && a.state === 'return') a.home = -1;
      this.orders = this.orders.filter(o => o.id !== u.id);
    }
    /** a warhead arrives. Population loss is a game abstraction: a share of each nearby metro region. */
    detonate(m) {
      const [lat, lon] = m.to; this.detonations++;
      let dead = 0; const hit = [];
      for (const c of this.cities) {
        const d = gc(lat, lon, c.lat, c.lon); if (d > 1.6) continue;
        const f = d < 0.4 ? 0.55 : 0.55 * (1 - (d - 0.4) / 1.2); const k = c.pop * f; if (k <= 0) continue;
        c.pop -= k; dead += k; hit.push([c.id, k]);
        const B = this.b[c.bloc]; B.deaths += k; B.pop -= k;
        if (c.bloc === m.bloc) { this.b[m.bloc].collateral += k; }
        else if (this.b[c.bloc].active) this.b[m.bloc].kills += k; else this.b[m.bloc].collateral += k;
      }
      for (const u of this.units) if (u.alive && gc(lat, lon, u.lat, u.lon) < (u.type === 'silo' ? 0.45 : 0.7)) this.destroyUnit(u, m.bloc, 'nuclear strike');
      for (const a of this.air) if (gc(lat, lon, a.lat, a.lon) < 0.6) a.alive = false;
      const city = hit.length ? this.cities[hit.sort((a, b) => b[1] - a[1])[0][0]] : null;
      this.ev({ type: 'det', id: m.id, bloc: m.bloc, lat, lon, dead, city: city ? city.name : null, tb: m.tb });
      if (!this.firstBlood && dead > 0) { this.firstBlood = true; this.ev({ type: 'firstblood', lat, lon }); }
      if (city && dead > 0.05) this.news(city.name.toUpperCase() + ' HIT. ' + fmtM(dead) + ' casualties.', null, 'det');
      else this.news('Detonation ' + (m.tb >= 0 && m.tb < 6 ? 'in ' + BLOCS[m.tb].name + ' territory' : 'at sea') + '.', null, 'det');
      this.score();
    }
    score() { for (const b of this.b) b.score = Math.round(2 * b.kills - b.deaths - b.collateral); }
    stock() { let s = 0; for (const u of this.units) if (u.alive) s += u.wh; for (const a of this.air) s += a.wh || 0; for (const u of this.units) if (u.alive && u.type === 'airbase') s += u.bo; return s; }
    checkEnd() {
      if (this.defcon !== 1 || this.over) return;
      const since = this.t - this.d1At;
      if (this.finalAt === null) {
        const fired = this.b.reduce((s, b) => s + b.launched, 0), left = this.stock();
        if ((fired > 0 && fired >= 0.7 * (fired + left)) || since >= D1_LEN - FINAL) { this.finalAt = this.t; this.endAt = this.t + FINAL; this.ev({ type: 'final' }); this.news('Victory timer started. The war ends in ' + FINAL + ' seconds.', null, 'alert'); }
      }
      const airborne = this.missiles.some(m => m.alive);
      if (this.endAt !== null && this.t >= this.endAt && !airborne) this.finish();
      if (this.humans.length && this.humans.every(h => this.b[h].pop <= 0)) this.finish();
    }
    posture(b) {
      let p = 0; for (const u of this.units) if (u.alive && u.bloc === b) p += u.wh * 2 + u.abm * 0.3 + (u.type === 'radar' ? 3 : 0) + (u.fi + u.bo);
      return Math.round(p + this.b[b].allies.length * 6 + this.b[b].pop / this.b[b].pop0 * 20);
    }
    finish() {
      if (this.over) return; this.over = true; this.score();
      const act = this.b.filter(b => b.active);
      const deterrence = this.detonations === 0;
      for (const b of act) b.post = this.posture(b.id);
      let win;
      if (deterrence) win = act.slice().sort((a, b) => b.post - a.post)[0];
      else win = act.slice().sort((a, b) => b.score - a.score)[0];
      const total = this.b.reduce((s, b) => s + b.deaths, 0);
      const dark = this.cities.filter(c => c.pop < c.pop0 * 0.35).length;
      this.result = { deterrence, winner: win.id, total, dark, blocs: act.map(b => ({ id: b.id, deaths: b.deaths, kills: b.kills, score: b.score, post: b.post, pop0: b.pop0 })) };
      this.ev({ type: 'over', result: this.result });
    }

    /* ----- the per-bloc view (this is ALL a screen or the network guest ever gets) ----- */
    viewFor(bloc, full) {
      const B = this.b[bloc], S = B._S || this.sensors(bloc), mine = u => u.bloc === bloc;
      const V = { t: this.t, defcon: this.defcon, phaseEnd: this.phaseEnd, d1At: this.d1At, endAt: this.endAt, speed: this.speed, over: this.over, result: this.result, me: bloc, scenario: this.opts.scenario, diff: this.diffKey };
      V.blocs = this.b.map(b => ({ id: b.id, active: b.active, human: b.human, pop: Math.round(b.pop * 100) / 100, pop0: b.pop0, deaths: b.deaths, kills: b.kills, score: b.score,
        allies: b.allies.slice(), cf: b.ceasefire[bloc] > this.t ? Math.round(b.ceasefire[bloc] - this.t) : 0, pers: b.id === bloc || !b.active ? null : (this.humans.includes(b.id) ? 'human' : b.pers), launched: b.launched }));
      V.my = { budget: B.budget, sats: B.sats, low: B.low, lowFired: B.lowFired, standDown: Math.max(0, B.standDownUntil - this.t), intercepts: B.intercepts || 0, orders: this.orders.filter(o => o.bloc === bloc).length };
      V.units = [];
      for (const u of this.units) {
        if (!u.alive && !(u.dead > this.t - 20 && (mine(u) || u.seen[bloc] !== undefined))) continue;
        const own = mine(u) || B.allies.includes(u.bloc);
        if (!own && u.alive && !(u.seen[bloc] !== undefined || (u.rev[bloc] || 0) > this.t)) continue;
        if (!own && !UNIT[u.type].land && u.alive && !this.visibleUnit(bloc, u, S)) continue;
        const o = { id: u.id, type: u.type, bloc: u.bloc, lat: r2(u.lat), lon: r2(u.lon), alive: u.alive };
        if (!own) { o.stale = !this.visibleUnit(bloc, u, S); if (u.type === 'silo' && (u.rev[bloc] || 0) > this.t) o.mode = u.mode; }
        else { o.mode = u.mode; o.pend = u.pend; o.modeIn = u.pend ? Math.max(0, u.modeAt - this.t) : 0; o.wh = u.wh; o.abm = u.abm; o.fi = u.fi; o.bo = u.bo; o.path = u.path ? u.path.map(p => [r2(p[0]), r2(p[1])]) : null; o.cd = Math.max(0, u.cd - this.t); o.mine = mine(u); }
        V.units.push(o);
      }
      V.missiles = this.missiles.filter(m => m.alive && this.missileVisible(bloc, m)).map(m => ({ id: m.id, bloc: m.bloc, kind: m.kind, from: m.from, to: m.to, t0: m.t0, dur: m.dur, alt: m.alt, tb: m.tb }));
      V.ints = this.ints.filter(i => i.bloc === bloc || B.allies.includes(i.bloc) || this.canSee(bloc, i.from[0], i.from[1], false, S)).map(i => ({ id: i.id, bloc: i.bloc, from: i.from, to: i.to, t0: i.t0, dur: i.dur }));
      V.air = this.air.filter(a => a.bloc === bloc || B.allies.includes(a.bloc) || this.canSee(bloc, a.lat, a.lon, false, S) || (a.rev[bloc] || 0) > this.t)
        .map(a => ({ id: a.id, kind: a.kind, bloc: a.bloc, lat: r2(a.lat), lon: r2(a.lon), hdg: a.hdg, state: a.bloc === bloc ? a.state : undefined, dest: a.bloc === bloc ? a.dest : undefined, wh: a.bloc === bloc ? a.wh : undefined, fuel: a.bloc === bloc ? Math.round(a.fuel) : undefined }));
      V.cities = this.cities.map(c => Math.round(c.pop * 100) / 100);
      V.sensors = S.filter(s => s[3] === 'radar' || s[3] === 'sat').map(s => [r2(s[0]), r2(s[1]), s[2], s[3]]);
      V.offers = this.offers.filter(o => o.to === bloc).map(o => ({ id: o.id, from: o.from, kind: o.kind, left: Math.round(o.until - this.t) }));
      V.incoming = this.incomingTo(bloc).length;
      return V;
    }
    /** events this bloc is allowed to see (public ones + its own) */
    eventsFor(bloc, list) { return list.filter(e => !e.to || e.to.includes(bloc)).map(e => { const o = Object.assign({}, e); delete o.to; return o; }); }
  }
  function setTimeoutish(g, s, f) { (g._timers = g._timers || []).push({ at: g.t + s, f }); }
  const r2 = v => Math.round(v * 100) / 100;
  function fmtM(m) { if (m >= 1) return (m >= 10 ? Math.round(m) : m.toFixed(1)) + ' million'; return Math.round(m * 1000) + ',000'; }

  const MCSim = { Game, BLOCS, UNIT, TYPES, AIR, BUDGET, PHASE, D1_LEN, FINAL, SCENARIOS, DIFF, PERS, RNG, gc, slerp, vec, toLL, landBloc, isWater, waterOwner, cellAt, seaPath, waterLine, fmtM };
  if (typeof module !== 'undefined') module.exports = MCSim; else root.MCSim = MCSim;
})(typeof window !== 'undefined' ? window : globalThis);
