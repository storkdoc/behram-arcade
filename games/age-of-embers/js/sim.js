/* AGE OF EMBERS — deterministic simulation (no DOM). Fixed 20 Hz tick.
   Everything the UI and the CPU players do goes through the cmd* functions. */
(function (E) {
  'use strict';
  const U = E.U, D = E.D, P = E.Path, MT = E.Map.T;
  const DT = 0.05;
  const b64 = {
    enc: (u8) => { if (typeof Buffer !== 'undefined' && typeof btoa === 'undefined') return Buffer.from(u8).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); },
    dec: (s) => { if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') return new Uint8Array(Buffer.from(s, 'base64')); const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  };
  const CIRC = []; for (let r = 0; r <= 14; r++) { const o = []; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) o.push(x, y); CIRC.push(o); }
  const isMil = (t) => t !== 'villager' && t !== 'fishboat' && t !== 'deer';

  E.Game = function (opts) {
    const G = this; G.opts = opts; G.DT = DT;
    G.time = 0; G.tick = 0; G.nextId = 1; G.events = []; G.over = false; G.winner = -1; G.paused = false;
    G.rng = U.rng((opts.seed || 1) * 7919 + 13);
    G.ents = new Map(); G.units = []; G.blds = []; G.res = []; G.projs = [];
    G.flowCache = new Map(); G.decals = [];
    G.popLimit = opts.popLimit || 100;
    let map = opts.map;
    if (!map) {
      let seed = opts.seed >>> 0;
      for (let tries = 0; tries < 8; tries++) { map = E.Map.generate({ seed, type: opts.mapType, size: opts.size, players: opts.players.length }); if (G._connected(map)) break; seed = (seed + 1013) >>> 0; }
    }
    G.map = map; const w = G.w = map.w, h = G.h = map.h; const N = w * h;
    G.terr = map.terr; G.height = map.height;
    G.blk = new Uint16Array(N); G.blkW = new Uint16Array(N); G.occ = new Int32Array(N);
    G.pass = new Uint8Array(N); G.passW = new Uint8Array(N);
    for (let i = 0; i < N; i++) G._refresh(i);
    G.players = opts.players.map((po, i) => G._newPlayer(po, i));
    // spatial hash
    G.cs = 3; G.cw = Math.ceil(w / G.cs); G.ch = Math.ceil(h / G.cs); G.head = new Int32Array(G.cw * G.ch); G.nxt = new Int32Array(4096);
    if (!opts.noSetup) G._setup(map);
    G.ais = [];
  };
  const Gp = E.Game.prototype;
  Gp._connected = function (map) {
    if (map.starts.length < 2) return true;
    const w = map.w, h = map.h, pass = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) pass[i] = map.terr[i] !== MT.WATER ? 1 : 0;
    for (const r of map.res) pass[r.ty * w + r.tx] = 0;
    const s = map.starts; for (const st of s) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) pass[(st.ty + y) * w + st.tx + x] = 1;
    const seen = new Uint8Array(w * h), q = [s[0].ty * w + s[0].tx]; seen[q[0]] = 1;
    while (q.length) { const c = q.pop(), cx = c % w, cy = (c / w) | 0; for (let k = 0; k < 4; k++) { const nx = cx + [1, -1, 0, 0][k], ny = cy + [0, 0, 1, -1][k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const ni = ny * w + nx; if (!seen[ni] && pass[ni]) { seen[ni] = 1; q.push(ni); } } }
    return s.every(st => seen[st.ty * w + st.tx]);
  };
  Gp._refresh = function (i) {
    const t = this.terr[i];
    this.pass[i] = (t !== MT.WATER && this.blk[i] === 0) ? 1 : 0;
    this.passW[i] = ((t === MT.WATER || t === MT.SHALLOW) && this.blkW[i] === 0) ? 1 : 0;
  };
  Gp._newPlayer = function (po, i) {
    const N = this.w * this.h;
    return { id: i, name: po.name || ('Player ' + (i + 1)), color: po.color === undefined ? i : po.color, ai: po.ai === undefined ? null : po.ai, team: po.team === undefined ? i : po.team, human: po.human !== undefined ? po.human : po.ai == null,
      res: Object.assign({ f: 200, w: 200, g: 100, s: 150 }, this.opts.startRes || {}, po.res || {}), age: 0, pop: 0, popCap: 0,
      m: D.newMods(), tier: { infantry: 0, spear: 0, archer: 0, knight: 0, ram: 0, catapult: 0, galley: 0 }, techs: {}, techOrder: [], ver: 1, sc: {},
      vis: new Uint8Array(N), exp: new Uint8Array(N), alive: true, wonderT: -1, prices: { f: 100, w: 100, s: 100 },
      stats: { gathered: { f: 0, w: 0, g: 0, s: 0 }, kills: 0, losses: 0, razed: 0, bldLost: 0, trained: 0, techs: 0, ageT: [0, -1, -1, -1], timeline: [], deer: 0, spent: 0, maxArmy: 0, tradeG: 0 },
      lastAlert: -99, alertX: 0, alertY: 0, housed: false };
  };
  Gp._setup = function (map) {
    const G = this;
    for (const r of map.res) G.addRes(r.type, r.tx, r.ty, r.amt, r.v);
    for (const d of map.deer) G.spawnUnit('deer', -1, d.x, d.y);
    G.players.forEach((p, i) => {
      const s = map.starts[i]; if (!s) return;
      G.placeBuilding('towncenter', i, s.tx - 1, s.ty - 1, true);
      const pos = [[-2.2, 1.2], [1.6, 2.4], [2.6, -1.2]];
      for (const q of pos) G.spawnUnit('villager', i, s.tx + 0.5 + q[0], s.ty + 0.5 + q[1]);
      G.spawnUnit('scout', i, s.tx + 0.5 - 2.4, s.ty + 0.5 - 2.2);
      p.startX = s.tx + 0.5; p.startY = s.ty + 0.5;
    });
    G.updateVision(true);
  };
  Gp.ev = function (type, o) { o = o || {}; o.type = type; this.events.push(o); if (this.events.length > 3000) this.events.splice(0, 1500); };
  Gp.get = function (id) { return id ? this.ents.get(id) : undefined; };
  Gp.enemy = function (a, b) { if (a < 0 || b < 0) return false; return a !== b && this.players[a].team !== this.players[b].team; };

  /* ------------------------------ stats ------------------------------ */
  Gp.ustat = function (owner, type) {
    const d = D.UNITS[type];
    if (owner < 0) return { hp: d.hp[0], atk: 0, range: 0, rate: 2, am: 0, ap: 0, speed: d.speed[0], los: d.los, bonus: {}, dmg: 'm', cls: d.cls, r: d.r, name: d.name };
    const p = this.players[owner]; const c = p.sc[type]; if (c && c.ver === p.ver) return c;
    const tier = p.tier[type] || 0, A = (a) => a[Math.min(tier, a.length - 1)], m = p.m;
    const s = { ver: p.ver, tier, name: d.tiers ? d.tiers[tier] : d.name, cls: d.cls, hp: A(d.hp), atk: A(d.atk), range: A(d.range), rate: d.rate, am: A(d.am), ap: A(d.ap), speed: A(d.speed), los: d.los, dmg: d.dmg, r: d.r, minRange: d.minRange || 0, splash: d.splash || 0, bonus: {}, attacksOnly: d.attacksOnly };
    if (d.bonus) for (const k in d.bonus) s.bonus[k] = Array.isArray(d.bonus[k]) ? A(d.bonus[k]) : d.bonus[k];
    if (d.cls === 'villager') { s.hp += m.vilHp; s.am += m.vilAm; s.ap += m.vilAp; s.speed *= m.vilSpeed; }
    if (d.cls === 'infantry' || d.cls === 'spear' || d.cls === 'cavalry') s.atk += m.atkM;
    if (d.cls === 'infantry' || d.cls === 'spear') { s.am += m.infAm; s.ap += m.infAp; }
    if (d.cls === 'archer') { s.atk += m.atkP; s.range += m.rangeP; s.am += m.arcAm; s.ap += m.arcAp; s.rate *= m.arcRate; s.los += m.rangeP; }
    if (d.cls === 'cavalry') { s.am += m.cavAm; s.ap += m.cavAp; s.speed *= m.cavSpeed; }
    if (type === 'galley') { s.atk += m.atkP; s.range += m.rangeP; }
    s.ranged = s.range > 1.2;
    p.sc[type] = s; return s;
  };
  Gp.bstat = function (owner, type) {
    const d = D.BUILD[type], p = this.players[owner];
    let hp = d.hp * p.m.bldHp; if (type === 'tower') hp *= p.m.towerHp;
    const s = { hp: Math.round(hp), am: d.am + p.m.bldArm, ap: d.ap + p.m.bldArm, los: d.los };
    if (d.atk) s.atk = { dmg: d.atk.dmg + p.m.atkP + p.m.towerAtk, range: d.atk.range + p.m.rangeP + (type === 'tower' ? p.m.towerRange : 0), rate: d.atk.rate };
    return s;
  };

  /* ------------------------------ entities ------------------------------ */
  Gp.addRes = function (type, tx, ty, amt, v) {
    const G = this, id = G.nextId++;
    const r = { id, k: 'r', type, tx, ty, x: tx + 0.5, y: ty + 0.5, amt, max: amt, v: v || 0, gatherers: 0 };
    G.ents.set(id, r); G.res.push(r);
    if (type !== 'carcass') { const i = ty * G.w + tx; G.occ[i] = id; if (type === 'fish') G.blkW[i]++; else G.blk[i]++; G._refresh(i); }
    return r;
  };
  Gp.removeRes = function (r) {
    const G = this; if (r.dead) return; r.dead = true; G.ents.delete(r.id); const k = G.res.indexOf(r); if (k >= 0) G.res.splice(k, 1);
    if (r.type !== 'carcass') { const i = r.ty * G.w + r.tx; if (G.occ[i] === r.id) G.occ[i] = 0; if (r.type === 'fish') G.blkW[i]--; else G.blk[i]--; G._refresh(i); G.flowCache.clear(); }
    if (r.type === 'tree') { G.decals.push({ kind: 'stump', x: r.x, y: r.y, v: r.v, t: G.time }); if (G.decals.length > 900) G.decals.shift(); }
    G.ev('resGone', { id: r.id, rt: r.type, x: r.x, y: r.y });
  };
  Gp.spawnUnit = function (type, owner, x, y) {
    const G = this, id = G.nextId++, s = G.ustat(owner, type);
    const u = { id, k: 'u', type, owner, x, y, px: x, py: y, hp: s.hp, st: 'idle', tgt: 0, node: 0, carry: 0, ct: null, path: null, pi: 0, gx: x, gy: y, cd: 0, anim: 'idle', at: G.rng() * 10, dir: Math.PI * 0.25 + (G.rng() - 0.5), am: false, idleT: 0, stuck: 0, scan: (id % 10) * 0.05, naval: !!D.UNITS[type].naval, born: G.time, r0: D.UNITS[type].r };
    G.ents.set(id, u); G.units.push(u);
    if (owner >= 0) { G.players[owner].stats.trained++; G._recountPop(owner); }
    else { u.home = { x, y }; }
    return u;
  };
  Gp.placeBuilding = function (type, owner, tx, ty, done) {
    const G = this, id = G.nextId++, d = D.BUILD[type], s = G.bstat(owner, type);
    const b = { id, k: 'b', type, owner, tx, ty, size: d.size, x: tx + d.size / 2, y: ty + d.size / 2, hp: done ? s.hp : 1, prog: done ? 1 : 0, done: !!done, queue: [], qt: 0, rally: null, cd: 0, builders: 0, food: type === 'farm' ? d.food + G.players[owner].m.farmFood : 0, farmer: 0, born: G.time, burn: 0 };
    G.ents.set(id, b); G.blds.push(b);
    for (let y = ty; y < ty + d.size; y++) for (let x = tx; x < tx + d.size; x++) { const i = y * G.w + x; G.occ[i] = id; if (!d.walk) { G.blk[i]++; G.blkW[i]++; } G._refresh(i); }
    G.flowCache.clear();
    if (done) G._completed(b, true);
    return b;
  };
  Gp.removeBuilding = function (b, silent) {
    const G = this; if (b.dead) return; b.dead = true; G.ents.delete(b.id); const k = G.blds.indexOf(b); if (k >= 0) G.blds.splice(k, 1);
    const d = D.BUILD[b.type];
    for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) { const i = y * G.w + x; if (G.occ[i] === b.id) G.occ[i] = 0; if (!d.walk) { G.blk[i]--; G.blkW[i]--; } G._refresh(i); }
    G.flowCache.clear();
    const p = G.players[b.owner];
    // refund queued items
    b.queue.forEach((q, qi) => { G._refund(p, q.cost, 1); if (q.tech) delete p.researching; });
    if (b.queue.length && b.queue[0].tech) p.researching = null;
    if (!silent) { G.decals.push({ kind: 'rubble', x: b.x, y: b.y, size: b.size, t: G.time }); G.ev('bldDie', { id: b.id, bt: b.type, x: b.x, y: b.y, size: b.size, owner: b.owner, age: p.age }); }
    G._recountPop(b.owner);
  };
  Gp.killUnit = function (u, by) {
    const G = this; if (u.dead) return; u.dead = true; G.ents.delete(u.id); const k = G.units.indexOf(u); if (k >= 0) G.units.splice(k, 1);
    G._dropNode(u);
    G.ev('die', { id: u.id, ut: u.type, owner: u.owner, x: u.x, y: u.y, dir: u.dir, tier: u.owner >= 0 ? G.ustat(u.owner, u.type).tier : 0, age: u.owner >= 0 ? G.players[u.owner].age : 0, carry: u.ct });
    if (u.type === 'deer') { const c = G.addRes('carcass', Math.floor(u.x), Math.floor(u.y), D.UNITS.deer.food, 0); c.x = u.x; c.y = u.y; c.dir = u.dir; if (by && by.owner >= 0) { G.players[by.owner].stats.deer++; if (by.st === 'gather' && by.node === u.id) by.node = c.id; } for (const o of G.units) if (o.node === u.id) o.node = c.id; }
    if (u.owner >= 0) { G.players[u.owner].stats.losses++; G._recountPop(u.owner); }
    if (by && by.owner >= 0 && u.owner >= 0) G.players[by.owner].stats.kills++;
  };
  Gp._recountPop = function (o) {
    if (o < 0) return; const G = this, p = G.players[o]; let pop = 0, cap = 0;
    for (const u of G.units) if (u.owner === o) pop++;
    for (const b of G.blds) if (b.owner === o) { if (b.done && D.BUILD[b.type].pop) cap += D.BUILD[b.type].pop; if (b.queue.length && b.queue[0].unit && b.queue[0].t > 0) pop++; }
    p.pop = pop; p.popCap = Math.min(cap, G.popLimit);
  };
  Gp._completed = function (b, silent) {
    const G = this, p = G.players[b.owner]; b.done = true; b.prog = 1; b.hp = Math.max(b.hp, 1);
    if (!silent) { b.hp = G.bstat(b.owner, b.type).hp * Math.min(1, b.hpFrac || 1); G.ev('built', { id: b.id, bt: b.type, owner: b.owner, x: b.x, y: b.y }); }
    if (b.type === 'wonder') { p.wonderT = D.WONDER_TIME; G.ev('wonderBuilt', { owner: b.owner, x: b.x, y: b.y }); }
    G._recountPop(b.owner);
  };
  Gp._refund = function (p, cost, frac) { for (const k in cost) p.res[k] += Math.floor(cost[k] * frac); };
  Gp.canAfford = function (p, cost) { for (const k in cost) if ((p.res[k] || 0) < cost[k]) return false; return true; };
  Gp._pay = function (p, cost) { for (const k in cost) { p.res[k] -= cost[k]; p.stats.spent += cost[k]; } };

  /* ------------------------------ rules: availability ------------------------------ */
  Gp.hasBuilt = function (o, type) { for (const b of this.blds) if (b.owner === o && b.type === type && b.done) return true; return false; };
  Gp.count = function (o, type, incl) { let n = 0; for (const b of this.blds) if (b.owner === o && b.type === type && (incl || b.done)) n++; return n; };
  Gp.ageReqMet = function (o, a) {
    const r = D.AGE_REQ[a]; if (!r) return true; const got = new Set();
    for (const b of this.blds) if (b.owner === o && b.done && r.from.indexOf(b.type) >= 0) got.add(b.type);
    return got.size >= r.need;
  };
  // why can't player o build type? returns '' when ok
  Gp.buildBlock = function (o, type) {
    const p = this.players[o], d = D.BUILD[type];
    if (this.opts.allowBuild && this.opts.allowBuild.indexOf(type) < 0) return 'Not available in this scenario';
    if ((d.age || 0) > p.age) return 'Requires the ' + D.AGES[d.age].name;
    if (d.req && !this.hasBuilt(o, d.req)) return 'Requires a ' + D.BUILD[d.req].name;
    if (type === 'wonder' && this.count(o, 'wonder', true)) return 'Only one wonder at a time';
    return '';
  };
  Gp.trainBlock = function (o, type) {
    const p = this.players[o], d = D.UNITS[type];
    if (this.opts.allowTrain && this.opts.allowTrain.indexOf(type) < 0) return 'Not available in this scenario';
    if ((d.age || 0) > p.age) return 'Requires the ' + D.AGES[d.age].name;
    return '';
  };
  Gp.techBlock = function (o, key) {
    const p = this.players[o], t = D.TECH[key];
    if (p.techs[key]) return 'Researched';
    if (this.opts.allowTech && this.opts.allowTech.indexOf(key) < 0) return 'Not available in this scenario';
    if (t.ageUp) { if (p.age !== t.ageUp - 1) return p.age >= t.ageUp ? 'Researched' : 'Requires the ' + D.AGES[t.ageUp - 1].name; if (!this.ageReqMet(o, t.ageUp)) return t.desc; }
    else if (t.age > p.age) return 'Requires the ' + D.AGES[t.age].name;
    if (t.req && !p.techs[t.req]) return 'Requires ' + D.TECH[t.req].name;
    for (const b of this.blds) if (b.owner === o) for (const q of b.queue) if (q.tech === key) return 'In progress';
    if (t.ageUp) for (const b of this.blds) if (b.owner === o) for (const q of b.queue) if (q.tech && D.TECH[q.tech].ageUp) return 'Already advancing';
    return '';
  };
  // placement test: returns '' when the footprint is free
  Gp.placeBlock = function (o, type, tx, ty, ignoreFog) {
    const G = this, d = D.BUILD[type], p = G.players[o]; const s = d.size;
    if (tx < 1 || ty < 1 || tx + s > G.w - 1 || ty + s > G.h - 1) return 'Out of bounds';
    let water = 0, land = 0;
    for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) {
      const i = y * G.w + x;
      if (!ignoreFog && !p.exp[i]) return 'Unexplored';
      if (G.occ[i]) return 'Blocked';
      const t = G.terr[i]; if (t === MT.WATER || t === MT.SHALLOW) water++; else land++;
    }
    if (d.naval) {
      if (land > 0) return 'Docks must be built on water';
      let shore = 0; for (let y = ty - 1; y <= ty + s; y++) for (let x = tx - 1; x <= tx + s; x++) { const i = y * G.w + x; if ((x < tx || y < ty || x >= tx + s || y >= ty + s) && G.terr[i] !== MT.WATER && G.terr[i] !== MT.SHALLOW) shore++; }
      if (shore < 2) return 'Docks must touch the shore';
    } else if (water > 0) return 'Cannot build on water';
    return '';
  };

  /* ------------------------------ commands ------------------------------ */
  Gp._own = function (ids, o) { const out = []; for (const id of ids) { const e = this.ents.get(id); if (e && e.k === 'u' && (o === undefined || e.owner === o)) out.push(e); } return out; };
  Gp._reset = function (u) { u.path = null; u.flow = null; u.tgt = 0; u.am = false; u.task = 0; u.chase = 0; u.guard = null; u.grpSpd = 0; u.nextCmd = null; };
  Gp._dropNode = function (u) { if (u.node) { const n = this.ents.get(u.node); if (n && n.k === 'b' && n.farmer === u.id) n.farmer = 0; } };
  Gp.cmdStop = function (ids) { for (const u of this._own(ids)) { this._dropNode(u); this._reset(u); u.st = 'idle'; u.node = 0; } };
  Gp.cmdDelete = function (ids, o) {
    for (const id of ids) { const e = this.ents.get(id); if (!e || e.owner !== o) continue; if (e.k === 'u') this.killUnit(e); else if (e.k === 'b') { if (!e.done && e.prog < 0.01) this._refund(this.players[o], D.BUILD[e.type].cost, 1); this.removeBuilding(e); } }
  };
  // formation slots around (x,y) for a group
  Gp.formation = function (us, x, y, kind) {
    const G = this, n = us.length; let cx = 0, cy = 0; for (const u of us) { cx += u.x; cy += u.y; } cx /= n; cy /= n;
    let fx = x - cx, fy = y - cy; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl; const px = -fy, py = fx;
    const order = us.slice().sort((a, b) => G._rank(a) - G._rank(b) || a.id - b.id);
    const slots = new Map();
    if (kind === 'box') {
      const melee = order.filter(u => G._rank(u) < 2), inner = order.filter(u => G._rank(u) >= 2);
      const ring = Math.max(4, Math.ceil(Math.sqrt(n)) + 1), sp = 0.95;
      inner.forEach((u, i) => { const c = Math.ceil(Math.sqrt(inner.length)); const ix = i % c - (c - 1) / 2, iy = Math.floor(i / c) - (c - 1) / 2; slots.set(u.id, [x + (px * ix + fx * iy) * sp, y + (py * ix + fy * iy) * sp]); });
      const rr = Math.max(1.6, Math.sqrt(inner.length) * 0.6 + 1.1);
      melee.forEach((u, i) => { const a = i / melee.length * Math.PI * 2; const r = rr + Math.floor(i / 24) * 0.9; slots.set(u.id, [x + Math.cos(a) * r, y + Math.sin(a) * r]); });
      return slots;
    }
    const sp = kind === 'spread' ? 1.6 : 0.95;
    const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * 2.2))));
    order.forEach((u, i) => { const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols), c = i % cols - (inRow - 1) / 2; slots.set(u.id, [x + px * c * sp - fx * row * sp * 1.05, y + py * c * sp - fy * row * sp * 1.05]); });
    return slots;
  };
  Gp._rank = function (u) { const c = D.UNITS[u.type].cls; return c === 'cavalry' ? 0 : c === 'infantry' || c === 'spear' ? 1 : c === 'archer' || c === 'villager' ? 2 : c === 'siege' ? 3 : 4; };
  Gp.cmdMove = function (ids, x, y, o) {
    o = o || {}; const G = this, us = this._own(ids, o.owner); if (!us.length) return;
    x = U.clamp(x, 0.5, G.w - 0.5); y = U.clamp(y, 0.5, G.h - 0.5);
    const land = us.filter(u => !u.naval), sea = us.filter(u => u.naval);
    for (const grp of [land, sea]) {
      if (!grp.length) continue;
      const slots = grp.length > 1 ? G.formation(grp, x, y, o.formation || G.players[grp[0].owner].formation || 'line') : null;
      let spd = 0; if (grp.length > 1 && (o.formation || 'line') !== 'spread') { spd = 99; for (const u of grp) spd = Math.min(spd, G.ustat(u.owner, u.type).speed); }
      const useFlow = grp.length >= 5;
      for (const u of grp) {
        G._dropNode(u); G._reset(u); u.node = 0;
        let sx = x, sy = y; if (slots) { const s = slots.get(u.id); sx = s[0]; sy = s[1]; }
        const pass = u.naval ? G.passW : G.pass; const fixed = G._nearestPass(pass, sx, sy, 3);
        if (fixed) { sx = fixed[0]; sy = fixed[1]; }
        u.st = 'move'; u.am = !!o.attackMove; u.grpSpd = spd && Math.hypot(u.x - x, u.y - y) < 14 ? spd : 0;
        G._goTo(u, sx, sy, useFlow ? { gx: x, gy: y } : null);
      }
    }
    if (o.owner !== undefined && us[0]) G.ev('ack', { owner: us[0].owner, ut: us[0].type, kind: o.attackMove ? 'attack' : 'move', x, y, n: us.length });
  };
  Gp._nearestPass = function (pass, x, y, R) {
    const G = this; let tx = Math.floor(x), ty = Math.floor(y);
    if (tx >= 0 && ty >= 0 && tx < G.w && ty < G.h && pass[ty * G.w + tx]) return [x, y];
    for (let r = 1; r <= (R || 6); r++) { let best = null, bd = 1e9; for (let yy = ty - r; yy <= ty + r; yy++) for (let xx = tx - r; xx <= tx + r; xx++) { if (xx < 0 || yy < 0 || xx >= G.w || yy >= G.h || !pass[yy * G.w + xx]) continue; const d = U.d2(xx + 0.5, yy + 0.5, x, y); if (d < bd) { bd = d; best = [xx + 0.5, yy + 0.5]; } } if (best) return best; }
    return null;
  };
  // set up movement toward a point (optionally via a shared flow field toward the group's centre)
  Gp._goTo = function (u, x, y, grp) {
    const G = this; u.gx = x; u.gy = y; u.path = null; u.flow = null; u.pi = 0; u.stuck = 0; u.rect = null;
    const far = Math.hypot(u.x - x, u.y - y) > 10;
    if (grp && far) { u.flow = G._flowTo(u.naval, { x0: Math.floor(grp.gx), y0: Math.floor(grp.gy), x1: Math.floor(grp.gx), y1: Math.floor(grp.gy), adj: false }); }
    else G._astar(u, { x0: Math.floor(x), y0: Math.floor(y), x1: Math.floor(x), y1: Math.floor(y), adj: false });
  };
  Gp._goRect = function (u, rect) { // walk next to a blocked rect (resource, building, ...)
    const G = this; u.flow = null; u.rect = rect; u.stuck = 0; u.gx = (rect.x0 + rect.x1 + 1) / 2; u.gy = (rect.y0 + rect.y1 + 1) / 2;
    G._astar(u, rect);
  };
  Gp._flowTo = function (naval, goal) {
    const G = this, key = (naval ? 'w' : 'l') + goal.x0 + ',' + goal.y0 + ',' + goal.x1 + ',' + goal.y1 + (goal.adj ? 'a' : '');
    let f = G.flowCache.get(key); if (f) return f;
    if (G.flowCache.size > 24) G.flowCache.delete(G.flowCache.keys().next().value);
    f = { key, dist: P.flow(naval ? G.passW : G.pass, G.w, G.h, goal), goal }; G.flowCache.set(key, f); return f;
  };
  Gp._astar = function (u, goal) {
    const G = this, r = P.astar(u.naval ? G.passW : G.pass, G.w, G.h, u.x, u.y, goal, 7000);
    u.path = r.path; u.pi = 0; u.reach = r.reached;
    if (!goal.adj && r.reached && u.path.length) { u.path[u.path.length - 1] = [u.gx, u.gy]; }
  };
  Gp.cmdAttack = function (ids, tid, o) {
    o = o || {}; const G = this, t = G.ents.get(tid); if (!t) return;
    for (const u of G._own(ids, o.owner)) {
      const s = G.ustat(u.owner, u.type); if (!s.atk && u.type !== 'villager') continue;
      if (s.attacksOnly === 'building' && t.k !== 'b') continue;
      G._dropNode(u); G._reset(u); u.node = 0; u.st = 'attack'; u.tgt = tid; u.forced = true; u.rp = -9;
    }
    if (o.owner !== undefined) { const u = G._own(ids, o.owner)[0]; if (u) G.ev('ack', { owner: u.owner, ut: u.type, kind: 'attack', x: t.x, y: t.y }); }
  };
  Gp.cmdGather = function (ids, rid, o) {
    o = o || {}; const G = this, n = G.ents.get(rid); if (!n) return;
    for (const u of G._own(ids, o.owner)) {
      if (n.k === 'b' && n.type === 'farm') { if (u.type !== 'villager') continue; G._dropNode(u); G._reset(u); u.st = 'gather'; u.node = n.id; if (!n.farmer || !G.ents.get(n.farmer) || G.ents.get(n.farmer).node !== n.id) n.farmer = u.id; continue; }
      if (n.type === 'fish' ? u.type !== 'fishboat' : u.type !== 'villager') continue;
      G._dropNode(u); G._reset(u); u.st = 'gather'; u.node = n.id;
      if (n.k === 'u' && n.type === 'deer') { u.hunt = true; }
    }
    const u = G._own(ids, o.owner)[0]; if (u && o.owner !== undefined) G.ev('ack', { owner: u.owner, ut: u.type, kind: 'gather', rt: n.type, x: n.x, y: n.y });
  };
  Gp.cmdBuild = function (ids, type, tx, ty, o) {
    o = o || {}; const G = this, owner = o.owner, p = G.players[owner], d = D.BUILD[type];
    if (G.buildBlock(owner, type)) return null;
    if (G.placeBlock(owner, type, tx, ty, o.ignoreFog)) return null;
    if (!G.canAfford(p, d.cost)) { G.ev('noRes', { owner, cost: d.cost }); return null; }
    G._pay(p, d.cost);
    const b = G.placeBuilding(type, owner, tx, ty, false);
    G.cmdRepair(ids, b.id, { owner, queue: o.queue, silent: o.silent });
    if (!o.silent) G.ev('place', { owner, bt: type, x: b.x, y: b.y });
    return b;
  };
  Gp.cmdWall = function (ids, type, x0, y0, x1, y1, o) {
    o = o || {}; const G = this, owner = o.owner, p = G.players[owner], d = D.BUILD[type]; const tiles = [];
    let x = x0, y = y0; const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); // diagonal-friendly staircase line
    for (let k = 0; k <= n; k++) { const tx = Math.round(x0 + (x1 - x0) * (n ? k / n : 0)), ty = Math.round(y0 + (y1 - y0) * (n ? k / n : 0)); if (!tiles.length || tiles[tiles.length - 1][0] !== tx || tiles[tiles.length - 1][1] !== ty) { if (tiles.length) { const l = tiles[tiles.length - 1]; if (l[0] !== tx && l[1] !== ty) tiles.push([tx, l[1]]); } tiles.push([tx, ty]); } }
    const made = [];
    for (const t of tiles) { if (G.placeBlock(owner, type, t[0], t[1])) continue; if (!G.canAfford(p, d.cost)) { G.ev('noRes', { owner, cost: d.cost }); break; } G._pay(p, d.cost); made.push(G.placeBuilding(type, owner, t[0], t[1], false)); }
    if (made.length) { for (const u of G._own(ids, owner)) { if (u.type !== 'villager') continue; G._dropNode(u); G._reset(u); u.st = 'build'; u.task = made[0].id; u.queueB = made.map(b => b.id); } G.ev('place', { owner, bt: type, x: made[0].x, y: made[0].y }); }
    return made;
  };
  Gp.cmdRepair = function (ids, bid, o) {
    o = o || {}; const G = this, b = G.ents.get(bid); if (!b || b.k !== 'b') return;
    for (const u of G._own(ids, o.owner)) { if (u.type !== 'villager' || b.owner !== u.owner) continue; G._dropNode(u); G._reset(u); u.st = 'build'; u.task = bid; u.queueB = null; u.node = 0; }
    const u = G._own(ids, o.owner)[0]; if (u && !o.silent && o.owner !== undefined) G.ev('ack', { owner: u.owner, ut: 'villager', kind: 'build', x: b.x, y: b.y });
  };
  // smart right-click
  Gp.cmdSmart = function (ids, x, y, tid, o) {
    o = o || {}; const G = this, t = tid ? G.ents.get(tid) : null, owner = o.owner, us = G._own(ids, owner); if (!us.length) return;
    if (t) {
      if (t.k === 'r') { const v = us.filter(u => (t.type === 'fish') ? u.type === 'fishboat' : u.type === 'villager'); if (v.length) G.cmdGather(v.map(u => u.id), t.id, o); const rest = us.filter(u => v.indexOf(u) < 0); if (rest.length) G.cmdMove(rest.map(u => u.id), t.x, t.y, o); return; }
      if (t.k === 'u' && t.type === 'deer') { const v = us.filter(u => u.type === 'villager'); if (v.length) G.cmdGather(v.map(u => u.id), t.id, o); const rest = us.filter(u => u.type !== 'villager'); if (rest.length) G.cmdAttack(rest.map(u => u.id), t.id, o); return; }
      if (G.enemy(owner, t.owner)) { G.cmdAttack(us.map(u => u.id), t.id, o); const vs = us.filter(u => G.ustat(u.owner, u.type).attacksOnly === 'building' && t.k !== 'b'); if (vs.length) G.cmdMove(vs.map(u => u.id), t.x, t.y, o); return; }
      if (t.k === 'b' && t.owner === owner) {
        const vil = us.filter(u => u.type === 'villager'), rest = us.filter(u => u.type !== 'villager');
        if (vil.length) {
          if (!t.done || t.hp < G.bstat(owner, t.type).hp) G.cmdRepair(vil.map(u => u.id), t.id, o);
          else if (t.type === 'farm') G.cmdGather([vil[0].id], t.id, o);
          else if (D.BUILD[t.type].drop) { for (const u of vil) { if (u.carry > 0) { G._dropNode(u); G._reset(u); u.st = 'return'; u.dropTo = t.id; } else G.cmdMove([u.id], t.x, t.y + t.size / 2 + 0.6, o); } }
          else G.cmdMove(vil.map(u => u.id), t.x, t.y, o);
        }
        if (rest.length) G.cmdMove(rest.map(u => u.id), t.x, t.y + t.size / 2 + 1, o);
        return;
      }
    }
    G.cmdMove(ids, x, y, o);
  };
  Gp.cmdTrain = function (bid, type, o) {
    o = o || {}; const G = this, b = G.ents.get(bid); if (!b || !b.done || b.owner !== o.owner) return false; const p = G.players[b.owner];
    const d = D.BUILD[b.type]; if (!d.trains || d.trains.indexOf(type) < 0) return false;
    if (G.trainBlock(b.owner, type)) return false; if (b.queue.length >= 10) return false;
    const cost = D.UNITS[type].cost; if (!G.canAfford(p, cost)) { G.ev('noRes', { owner: b.owner, cost }); return false; }
    G._pay(p, cost); b.queue.push({ unit: type, cost, t: 0, T: D.UNITS[type].time }); return true;
  };
  Gp.cmdResearch = function (bid, key, o) {
    o = o || {}; const G = this, b = G.ents.get(bid); if (!b || !b.done || b.owner !== o.owner) return false; const p = G.players[b.owner], t = D.TECH[key];
    if (t.at !== b.type || G.techBlock(b.owner, key)) return false;
    if (!G.canAfford(p, t.cost)) { G.ev('noRes', { owner: b.owner, cost: t.cost }); return false; }
    G._pay(p, t.cost); b.queue.push({ tech: key, cost: t.cost, t: 0, T: t.time });
    if (t.ageUp) G.ev('ageStart', { owner: b.owner, age: t.ageUp });
    return true;
  };
  Gp.cmdCancel = function (bid, idx, o) {
    o = o || {}; const G = this, b = G.ents.get(bid); if (!b || b.owner !== o.owner) return; const q = b.queue[idx]; if (!q) return;
    b.queue.splice(idx, 1); G._refund(G.players[b.owner], q.cost, 1); if (idx === 0) b.qt = 0; G._recountPop(b.owner);
  };
  Gp.cmdRally = function (bid, x, y, tid, o) { const b = this.ents.get(bid); if (!b || b.owner !== (o || {}).owner) return; b.rally = { x, y, id: tid || 0 }; };
  Gp.cmdTrade = function (owner, res, buy) {
    const G = this, p = G.players[owner]; if (!G.hasBuilt(owner, 'market')) return false; const pr = p.prices[res];
    if (buy) { const c = Math.ceil(pr * (1 + p.m.fee)); if (p.res.g < c) { G.ev('noRes', { owner, cost: { g: c } }); return false; } p.res.g -= c; p.res[res] += 100; p.prices[res] = Math.min(400, pr + 4); }
    else { if (p.res[res] < 100) { G.ev('noRes', { owner, cost: { [res]: 100 } }); return false; } p.res[res] -= 100; const gain = Math.floor(pr * (1 - p.m.fee)); p.res.g += gain; p.stats.tradeG += gain; p.prices[res] = Math.max(20, pr - 4); }
    G.ev('trade', { owner }); return true;
  };

  /* ------------------------------ geometry ------------------------------ */
  Gp.edgeDist = function (u, t) {
    if (t.k === 'b') { const dx = Math.max(t.tx - u.x, 0, u.x - (t.tx + t.size)), dy = Math.max(t.ty - u.y, 0, u.y - (t.ty + t.size)); return Math.hypot(dx, dy) - u.r0; }
    if (t.k === 'r' && t.type !== 'carcass') { const dx = Math.max(t.tx - u.x, 0, u.x - (t.tx + 1)), dy = Math.max(t.ty - u.y, 0, u.y - (t.ty + 1)); return Math.hypot(dx, dy) - u.r0; }
    return Math.hypot(t.x - u.x, t.y - u.y) - u.r0 - (t.k === 'u' ? D.UNITS[t.type].r : 0.25);
  };
  Gp.rectOf = function (t) { if (t.k === 'b') return { x0: t.tx, y0: t.ty, x1: t.tx + t.size - 1, y1: t.ty + t.size - 1, adj: !D.BUILD[t.type].walk }; return { x0: t.tx, y0: t.ty, x1: t.tx, y1: t.ty, adj: true }; };
  Gp.hashUnits = function () {
    const G = this; G.head.fill(-1); if (G.nxt.length < G.units.length) G.nxt = new Int32Array(G.units.length * 2);
    for (let i = 0; i < G.units.length; i++) { const u = G.units[i]; const c = Math.min(G.ch - 1, Math.max(0, (u.y / G.cs) | 0)) * G.cw + Math.min(G.cw - 1, Math.max(0, (u.x / G.cs) | 0)); G.nxt[i] = G.head[c]; G.head[c] = i; }
  };
  Gp.near = function (x, y, R, fn) {
    const G = this, cs = G.cs; const x0 = Math.max(0, ((x - R) / cs) | 0), x1 = Math.min(G.cw - 1, ((x + R) / cs) | 0), y0 = Math.max(0, ((y - R) / cs) | 0), y1 = Math.min(G.ch - 1, ((y + R) / cs) | 0);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (let i = G.head[cy * G.cw + cx]; i !== -1; i = G.nxt[i]) { const u = G.units[i]; if (u && !u.dead) fn(u); }
  };
  Gp.visibleTo = function (o, e) { const p = this.players[o]; const i = Math.floor(e.y) * this.w + Math.floor(e.x); return p.vis[i] > 0; };
  Gp._acquire = function (u, s, R) {
    const G = this; let best = null, bs = 1e9; const o = u.owner;
    const onlyB = s.attacksOnly === 'building';
    if (!onlyB) G.near(u.x, u.y, R, (t) => {
      if (t.owner < 0 || !G.enemy(o, t.owner)) return; const d = Math.hypot(t.x - u.x, t.y - u.y); if (d > R) return;
      if (s.minRange && d < s.minRange + 0.5) return; if (u.naval === false && t.naval && !s.ranged) { if (d > 1.6) return; }
      if (!G.visibleTo(o, t)) return;
      const ts = D.UNITS[t.type]; let sc = d; if (ts.cls === 'villager') sc += 1.5; if (t.type === 'fishboat') sc += 2; if (t.type === 'ram' && !(s.bonus.siege)) sc += 4;
      if (s.bonus && s.bonus[ts.cls]) sc -= 2;
      if (sc < bs) { bs = sc; best = t; }
    });
    if (best) return best;
    for (const b of G.blds) {
      if (!G.enemy(o, b.owner)) continue; const dx = Math.max(b.tx - u.x, 0, u.x - (b.tx + b.size)), dy = Math.max(b.ty - u.y, 0, u.y - (b.ty + b.size)); const d = Math.hypot(dx, dy);
      if (d > R) continue; if (!G.players[o].exp[Math.floor(b.y) * G.w + Math.floor(b.x)]) continue;
      let sc = d + (D.BUILD[b.type].wall ? 6 : 0) + (b.type === 'farm' ? 3 : 0) - (D.BUILD[b.type].atk ? 1 : 0); if (sc < bs) { bs = sc; best = b; }
    }
    return best;
  };
  Gp.calcDmg = function (s, t) {
    let am, ap, cls;
    if (t.k === 'b') { const bs = this.bstat(t.owner, t.type); am = bs.am; ap = bs.ap; cls = D.BUILD[t.type].wall ? 'wall' : 'building'; }
    else { const ts = this.ustat(t.owner, t.type); am = ts.am; ap = ts.ap; cls = ts.cls; }
    let d = Math.max(1, s.atk - (s.dmg === 'p' ? ap : am));
    d += (s.bonus && (s.bonus[cls] || (cls === 'wall' ? s.bonus.building : 0))) || 0;
    return d;
  };
  Gp._damage = function (t, dmg, att) {
    const G = this; if (!t || t.dead) return;
    t.hp -= dmg; t.hitT = G.time;
    if (att && t.owner >= 0 && att.owner >= 0 && t.owner !== att.owner) {
      const p = G.players[t.owner];
      if (G.time - p.lastAlert > 14 || Math.hypot(p.alertX - t.x, p.alertY - t.y) > 14 && G.time - p.lastAlert > 4) { p.lastAlert = G.time; p.alertX = t.x; p.alertY = t.y; G.ev('underAttack', { owner: t.owner, x: t.x, y: t.y, bld: t.k === 'b', by: att.owner }); }
      p.lastHitT = G.time; p.lastHitX = t.x; p.lastHitY = t.y;
    }
    if (t.k === 'u') {
      if (t.hp <= 0) { G.killUnit(t, att); return; }
      if (t.type === 'deer') { if (att) { const a = Math.atan2(t.y - att.y, t.x - att.x); t.flee = 2.5; t.fa = a; t.st = 'flee'; } return; }
      if (att && att.k === 'u' && !att.dead && t.owner >= 0) {
        const ts = G.ustat(t.owner, t.type);
        if (ts.atk > 0 && t.type !== 'villager' && (t.st === 'idle' || (t.st === 'move' && t.am) || (t.st === 'attack' && !t.forced && G.ents.get(t.tgt) && G.ents.get(t.tgt).k === 'b'))) {
          if (!(ts.attacksOnly === 'building')) { t.st = 'attack'; t.tgt = att.id; t.forced = false; if (!t.guard) t.guard = { x: t.x, y: t.y }; }
        }
        // nearby idle soldiers help
        if (t.type === 'villager' || t.st === 'attack') G.near(t.x, t.y, 5, (f) => { if (f.owner === t.owner && f.st === 'idle' && isMil(f.type) && G.ustat(f.owner, f.type).atk > 0 && G.ustat(f.owner, f.type).attacksOnly !== 'building') { f.st = 'attack'; f.tgt = att.id; f.forced = false; f.guard = { x: f.x, y: f.y }; } });
      }
    } else if (t.k === 'b') {
      if (t.hp <= 0) { if (att && att.owner >= 0) G.players[att.owner].stats.razed++; G.players[t.owner].stats.bldLost++; if (t.type === 'wonder') { G.players[t.owner].wonderT = -1; G.ev('wonderLost', { owner: t.owner }); } G.removeBuilding(t); }
    }
  };
  Gp._shoot = function (att, s, t, kind) {
    const G = this; const sx = att.x, sy = att.y, tx = t.x, ty = t.y; const d = Math.hypot(tx - sx, ty - sy);
    const sp = kind === 'stone' ? 7 : 11;
    const pj = { kind, owner: att.owner, sx, sy, tx, ty, t: 0, T: Math.max(0.15, d / sp), tid: t.id, dmg: G.calcDmg(s, t), splash: s.splash || 0, s, from: att.id, h: att.k === 'b' ? (att.type === 'tower' ? 2.6 : 1.6) : 0.5, arc: kind === 'stone' ? 0.35 : 0.18 };
    if (kind === 'stone') { pj.tx = tx + (G.rng() - 0.5) * 0.4; pj.ty = ty + (G.rng() - 0.5) * 0.4; }
    G.projs.push(pj); G.ev('shoot', { kind, x: sx, y: sy, owner: att.owner, ut: att.type });
  };
  Gp._land = function (pj) {
    const G = this, t = G.ents.get(pj.tid), att = G.ents.get(pj.from) || { owner: pj.owner, k: 'x', x: pj.sx, y: pj.sy };
    if (pj.kind === 'stone') {
      G.ev('boom', { x: pj.tx, y: pj.ty });
      G.near(pj.tx, pj.ty, pj.splash + 0.6, (u) => { if (u.owner < 0 || !G.enemy(pj.owner, u.owner)) return; const d = Math.hypot(u.x - pj.tx, u.y - pj.ty); if (d > pj.splash + 0.3) return; G._damage(u, Math.max(1, G.calcDmg(pj.s, u) * (d < 0.5 ? 1 : 0.55)), att); });
      for (const b of G.blds.slice()) if (G.enemy(pj.owner, b.owner) && pj.tx > b.tx - 0.3 && pj.tx < b.tx + b.size + 0.3 && pj.ty > b.ty - 0.3 && pj.ty < b.ty + b.size + 0.3) G._damage(b, G.calcDmg(pj.s, b), att);
      return;
    }
    if (t && !t.dead) { G._damage(t, t.k === 'u' ? G.calcDmg(pj.s, t) : pj.dmg, att); G.ev('arrowHit', { x: t.x, y: t.y, k: t.k }); }
    else G.ev('arrowMiss', { x: pj.tx, y: pj.ty });
  };

  /* ------------------------------ movement ------------------------------ */
  Gp._passAt = function (u, x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false; const i = Math.floor(y) * this.w + Math.floor(x); return u.naval ? this.passW[i] : this.pass[i]; };
  Gp._move = function (u, s, dt) {
    const G = this; let ax, ay;
    if (u.flow) {
      const dd = Math.hypot(u.gx - u.x, u.gy - u.y);
      const fd = u.flow.dist[Math.floor(u.y) * G.w + Math.floor(u.x)];
      if (dd < 7 || !(fd < Infinity) || fd < 5) { u.flow = null; G._astar(u, { x0: Math.floor(u.gx), y0: Math.floor(u.gy), x1: Math.floor(u.gx), y1: Math.floor(u.gy), adj: false }); return 'moving'; }
      const st = P.flowStep(u.flow.dist, u.naval ? G.passW : G.pass, G.w, G.h, u.x, u.y);
      if (!st) { u.flow = null; G._astar(u, { x0: Math.floor(u.gx), y0: Math.floor(u.gy), x1: Math.floor(u.gx), y1: Math.floor(u.gy), adj: false }); return 'moving'; }
      ax = st[0]; ay = st[1];
    } else if (u.path && u.pi < u.path.length) {
      const wp = u.path[u.pi]; ax = wp[0]; ay = wp[1];
      const last = u.pi === u.path.length - 1;
      if (Math.hypot(ax - u.x, ay - u.y) < (last ? 0.08 : 0.3)) { u.pi++; if (u.pi >= u.path.length) return 'arrived'; const w2 = u.path[u.pi]; ax = w2[0]; ay = w2[1]; }
    } else return 'arrived';
    let sp = (u.grpSpd || s.speed) * dt; const ti = Math.floor(u.y) * G.w + Math.floor(u.x); if (G.terr[ti] === MT.SHALLOW && !u.naval) sp *= 0.8;
    const dx = ax - u.x, dy = ay - u.y, d = Math.hypot(dx, dy) || 1e-6; const step = Math.min(sp, d);
    const nx = u.x + dx / d * step, ny = u.y + dy / d * step;
    u.dir = Math.atan2(dy, dx); u.anim = 'walk';
    if (G._passAt(u, nx, ny)) { u.x = nx; u.y = ny; }
    else if (G._passAt(u, nx, u.y)) u.x = nx; else if (G._passAt(u, u.x, ny)) u.y = ny;
    // progress / stuck detection
    u.stuck += dt; if (u.stuck > 1.2) { const moved = Math.hypot(u.x - (u.sx0 || 0), u.y - (u.sy0 || 0)); u.sx0 = u.x; u.sy0 = u.y; u.stuck = 0; if (moved < 0.2) { u.rep = (u.rep || 0) + 1; if (u.rep > 4) { u.rep = 0; u.path = null; u.flow = null; return 'arrived'; } if (u.rect) G._astar(u, u.rect); else { u.flow = null; G._astar(u, { x0: Math.floor(u.gx), y0: Math.floor(u.gy), x1: Math.floor(u.gx), y1: Math.floor(u.gy), adj: false }); } } else u.rep = 0; }
    return 'moving';
  };
  Gp._approach = function (u, s, t, dt) { // walk toward an entity; repath when it moves
    const G = this;
    if (t.k === 'u') {
      if (!u.path || G.time - (u.rp || -9) > 0.8 && Math.hypot((u.tlx || 0) - t.x, (u.tly || 0) - t.y) > 0.8 || G.time - (u.rp || -9) > 3) { u.rp = G.time; u.tlx = t.x; u.tly = t.y; u.rect = null; u.flow = null; u.gx = t.x; u.gy = t.y; G._astar(u, { x0: Math.floor(t.x), y0: Math.floor(t.y), x1: Math.floor(t.x), y1: Math.floor(t.y), adj: false }); }
    } else if (!u.path || u.rectId !== t.id) { u.rectId = t.id; G._goRect(u, G.rectOf(t)); }
    const r = G._move(u, s, dt);
    if (r === 'arrived' && t.k !== 'u') {
      // hug the target: step straight toward its nearest edge point (tile blocking stops us at the edge)
      const x0 = t.k === 'b' ? t.tx : t.tx, y0 = t.ty, sz = t.k === 'b' ? t.size : 1;
      const cx = U.clamp(u.x, x0, x0 + sz), cy = U.clamp(u.y, y0, y0 + sz);
      if (Math.hypot(cx - u.x, cy - u.y) < 1.6 && !u.hug) { u.hug = 1; u.path = [[cx, cy]]; u.pi = 0; return 'moving'; }
      u.hug = 0; u.rp2 = (u.rp2 || 0) + 1; if (u.rp2 > 3) { u.rp2 = 0; return 'fail'; } u.rectId = 0;
    }
    return r;
  };
  Gp._unstick = function (u) {
    const G = this; if (G._passAt(u, u.x, u.y)) return;
    const p = G._nearestPass(u.naval ? G.passW : G.pass, u.x, u.y, 6); if (p) { u.x = p[0]; u.y = p[1]; u.path = null; }
  };
  Gp._separate = function () {
    const G = this;
    for (let i = 0; i < G.units.length; i++) {
      const a = G.units[i]; const ra = a.r0;
      G.near(a.x, a.y, 1.2, (b) => {
        if (b.id <= a.id || b.naval !== a.naval) return; const rr = ra + b.r0; const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr * 0.81) return; const d = Math.sqrt(d2) || 0.01; const ov = (rr * 0.9 - d);
        const wa = a.work ? 0.15 : a.anim === 'walk' ? 0.6 : 0.45, wb = b.work ? 0.15 : b.anim === 'walk' ? 0.6 : 0.45; const tw = wa + wb;
        const ux = d > 0.011 ? dx / d : Math.cos(a.id), uy = d > 0.011 ? dy / d : Math.sin(a.id);
        const pa = ov * wa / tw * 0.6, pb = ov * wb / tw * 0.6;
        let nx = a.x - ux * pa, ny = a.y - uy * pa; if (G._passAt(a, nx, ny)) { a.x = nx; a.y = ny; }
        nx = b.x + ux * pb; ny = b.y + uy * pb; if (G._passAt(b, nx, ny)) { b.x = nx; b.y = ny; }
      });
    }
  };

  /* ------------------------------ unit behaviour ------------------------------ */
  Gp.dropFor = function (o, rk, x, y, naval) {
    let best = null, bd = 1e9;
    for (const b of this.blds) { if (b.owner !== o || !b.done) continue; const d = D.BUILD[b.type]; if (!d.drop || d.drop.indexOf(rk) < 0) continue; if (naval !== !!d.naval && !(naval && b.type === 'dock')) { if (naval) continue; } if (!naval && b.type === 'dock' && false) continue; const dd = U.d2(b.x, b.y, x, y); if (dd < bd) { bd = dd; best = b; } }
    return best;
  };
  Gp.findNode = function (u, type, x, y, R) {
    const G = this; let best = null, bd = R * R;
    for (const r of G.res) {
      if (r.type !== type && !(type === 'berry' && r.type === 'carcass') && !(type === 'carcass' && r.type === 'carcass')) continue;
      const d = U.d2(r.x, r.y, x, y); if (d > bd) continue;
      if (!G.players[u.owner].exp[r.ty * G.w + r.tx]) continue;
      const pen = r.gatherers > 3 ? 6 : 0; if (d + pen < bd) { bd = d + pen; best = r; }
    }
    if (!best && type === 'carcass') { // hunt another deer nearby
      let bdd = R * R; for (const a of G.units) if (a.type === 'deer') { const d = U.d2(a.x, a.y, x, y); if (d < bdd && G.players[u.owner].exp[Math.floor(a.y) * G.w + Math.floor(a.x)]) { bdd = d; best = a; } }
    }
    return best;
  };
  Gp._unitTick = function (u, dt) {
    const G = this, s = G.ustat(u.owner, u.type); u.cd -= dt; u.work = false; u.scan -= dt;
    if (G.tick % 20 === u.id % 20) G._unstick(u);
    switch (u.st) {
      case 'idle': {
        u.anim = 'idle'; u.idleT += dt;
        if (u.type === 'deer') { if (u.scan <= 0) { u.scan = 3 + G.rng() * 6; if (G.rng() < 0.5) { const a = G.rng() * 6.283, r = G.rng() * 2.5; const x = u.home.x + Math.cos(a) * r, y = u.home.y + Math.sin(a) * r; if (G._passAt(u, x, y)) { u.st = 'move'; u.gx = x; u.gy = y; u.path = [[x, y]]; u.pi = 0; u.grpSpd = 0.45; } } } break; }
        if (s.atk > 0 && isMil(u.type) && u.scan <= 0 && u.stance !== 'passive') {
          u.scan = 0.5; const t = G._acquire(u, s, s.los + (s.ranged ? 0 : 1));
          if (t) { u.st = 'attack'; u.tgt = t.id; u.forced = false; u.guard = { x: u.x, y: u.y }; u.idleT = 0; }
        }
        break;
      }
      case 'flee': {
        u.flee -= dt; const sp = 1.7 * dt; const nx = u.x + Math.cos(u.fa) * sp, ny = u.y + Math.sin(u.fa) * sp; u.dir = u.fa; u.anim = 'walk';
        if (G._passAt(u, nx, ny)) { u.x = nx; u.y = ny; } else u.fa += 1.3;
        if (u.flee <= 0) { u.st = 'idle'; u.home = { x: u.x, y: u.y }; }
        break;
      }
      case 'move': {
        u.idleT = 0;
        if (u.am && u.scan <= 0) { u.scan = 0.4; const t = G._acquire(u, s, s.los); if (t) { u.resume = { x: u.gx, y: u.gy }; u.st = 'attack'; u.tgt = t.id; u.forced = false; break; } }
        const r = G._move(u, s, dt);
        if (r === 'arrived') { u.st = 'idle'; u.anim = 'idle'; u.path = null; u.grpSpd = 0; if (u.type === 'deer') u.grpSpd = 0; u.guard = { x: u.x, y: u.y }; if (u.nextCmd) { const c = u.nextCmd; u.nextCmd = null; c(); } }
        break;
      }
      case 'attack': G._attackTick(u, s, dt); break;
      case 'gather': G._gatherTick(u, s, dt); break;
      case 'return': G._returnTick(u, s, dt); break;
      case 'build': G._buildTick(u, s, dt); break;
    }
    if (u.anim === 'idle' || u.anim === 'walk') u.at += dt; else u.at += dt;
  };
  Gp._afterFight = function (u, s) {
    const G = this; u.tgt = 0; u.path = null;
    // look for the next enemy nearby before giving up
    const t = isMil(u.type) && u.stance !== 'passive' ? G._acquire(u, s, s.los) : null;
    if (t && (!u.guard || Math.hypot(t.x - u.guard.x, t.y - u.guard.y) < s.los + 7 || u.resume)) { u.tgt = t.id; u.forced = false; return; }
    if (u.resume) { const r = u.resume; u.resume = null; u.st = 'move'; u.am = true; G._goTo(u, r.x, r.y); return; }
    if (u.guard && !u.forced && Math.hypot(u.x - u.guard.x, u.y - u.guard.y) > 2) { const g = u.guard; u.st = 'move'; G._goTo(u, g.x, g.y); return; }
    u.st = 'idle'; u.forced = false;
  };
  Gp._attackTick = function (u, s, dt) {
    const G = this, t = G.ents.get(u.tgt);
    if (!t || t.dead || (t.owner >= 0 ? !G.enemy(u.owner, t.owner) : t.type !== 'deer') || (t.k === 'u' && !G.visibleTo(u.owner, t) && G.edgeDist(u, t) > 1.5)) return G._afterFight(u, s);
    if (s.attacksOnly === 'building' && t.k !== 'b') return G._afterFight(u, s);
    // leash for automatic engagements
    if (!u.forced && u.guard && !u.resume && Math.hypot(u.x - u.guard.x, u.y - u.guard.y) > s.los + 8) { u.tgt = 0; u.st = 'move'; G._goTo(u, u.guard.x, u.guard.y); return; }
    // retarget toward a closer threat every so often when hitting a building
    if (!u.forced && t.k === 'b' && u.scan <= 0 && s.attacksOnly !== 'building') { u.scan = 0.8; const n = G._acquire(u, s, Math.min(s.los, 5)); if (n && n.k === 'u') { u.tgt = n.id; return; } }
    const d = G.edgeDist(u, t);
    if (s.minRange && d < s.minRange && t.k === 'u') { const n = G._acquire(u, s, s.range); if (n && n !== t) { u.tgt = n.id; return; } }
    const rng = (u.type === 'villager' && t.type === 'deer') ? 2.5 : s.range;
    if (d <= rng + 0.05) {
      u.path = null; u.flow = null; u.dir = Math.atan2(t.y - u.y, t.x - u.x); u.anim = 'attack'; u.work = true;
      if (u.cd <= 0) {
        u.cd = s.rate; u.at = 0;
        if (s.ranged || rng > 1.2) G._shoot(u, s, t, u.type === 'catapult' ? 'stone' : (u.type === 'villager' ? 'spear' : 'arrow'));
        else { G._damage(t, G.calcDmg(s, t), u); G.ev('melee', { x: t.x, y: t.y, ut: u.type, tk: t.k, bt: t.type, owner: u.owner }); }
      }
    } else {
      if (G._approach(u, s, t, dt) === 'fail') G._afterFight(u, s);
    }
  };
  Gp._gatherTick = function (u, s, dt) {
    const G = this, p = G.players[u.owner]; let n = G.ents.get(u.node);
    if (!n || n.dead) {
      // find a replacement of the same kind near where we were
      const kind = u.lastKind; const rep = kind && kind !== 'farm' ? G.findNode(u, kind === 'berry' ? 'berry' : kind, u.lx || u.x, u.ly || u.y, kind === 'tree' ? 9 : 7) : null;
      if (rep) { u.node = rep.id; n = rep; } else { if (u.carry > 0) { u.st = 'return'; return; } u.st = 'idle'; u.node = 0; return; }
    }
    // hunting a live deer
    if (n.k === 'u') { u.lastKind = 'carcass'; if (G.edgeDist(u, n) <= 2.5) { u.dir = Math.atan2(n.y - u.y, n.x - u.x); u.anim = 'attack'; u.path = null; if (u.cd <= 0) { u.cd = 1.6; u.at = 0; G._shoot(u, { atk: 5, dmg: 'p', bonus: {} }, n, 'spear'); } } else G._approach(u, s, n, dt); return; }
    const kind = n.k === 'b' ? 'farm' : n.type; const rk = D.RESOF[kind];
    if (u.carry > 0 && u.ct !== rk) { u.carry = 0; }
    u.ct = rk; u.lastKind = kind; u.lx = n.x; u.ly = n.y;
    const cap = u.type === 'fishboat' ? 15 + (p.m.carry - 10) : p.m.carry;
    if (kind === 'farm') {
      if (!n.done || n.owner !== u.owner) { u.st = 'idle'; return; }
      if (n.farmer && n.farmer !== u.id) { const f = G.ents.get(n.farmer); if (f && f.node === n.id && !f.dead) { u.st = 'idle'; u.node = 0; return; } }
      n.farmer = u.id;
      if (!u.fpos || u.fid !== n.id) { u.fid = n.id; u.fpos = [n.tx + 0.7 + G.rng() * 1.6, n.ty + 0.7 + G.rng() * 1.6]; u.path = null; }
      const dd = Math.hypot(u.fpos[0] - u.x, u.fpos[1] - u.y);
      if (dd > 0.25) { if (!u.path || u.gx !== u.fpos[0]) G._goTo(u, u.fpos[0], u.fpos[1]); const mr = G._move(u, s, dt); if (mr === 'arrived' || mr === 'fail') { if (dd > 2.2) u.fpos = null; else u.fpos = [u.x, u.y]; } return; }
      u.anim = 'work'; u.wk = 'farm'; u.work = true; if ((G.tick + u.id) % 240 === 0) u.fpos = [n.tx + 0.7 + G.rng() * 1.6, n.ty + 0.7 + G.rng() * 1.6];
      const amt = D.GATHER.farm * p.m.farm * p.m.gather * dt; u.carry += amt; n.food -= amt;
      if (n.food <= 0) {
        const rc = { w: 60 };
        if (G.canAfford(p, rc) && p.autoFarm !== false) { G._pay(p, rc); n.food = D.BUILD.farm.food + p.m.farmFood; G.ev('reseed', { owner: u.owner, x: n.x, y: n.y }); }
        else { G.ev('farmDone', { owner: u.owner, x: n.x, y: n.y }); G.removeBuilding(n, true); u.st = u.carry > 0 ? 'return' : 'idle'; u.node = 0; return; }
      }
      if (u.carry >= cap) { u.carry = cap; u.st = 'return'; u.path = null; }
      return;
    }
    const d = G.edgeDist(u, n);
    if (d > 0.62) { if (G._approach(u, s, n, dt) === 'fail') { n.bad = (n.bad || 0) + 1; u.node = 0; const rep = G.findNode(u, kind, u.x, u.y, 8); if (rep && rep.id !== n.id) u.node = rep.id; else u.st = 'idle'; } return; }
    u.path = null; u.hug = 0; u.rp2 = 0; u.anim = 'work'; u.work = true; u.dir = Math.atan2(n.y - u.y, n.x - u.x);
    u.wk = kind === 'tree' ? 'chop' : (kind === 'gold' || kind === 'stone') ? 'mine' : kind === 'fish' ? 'fish' : 'forage';
    const mod = kind === 'tree' ? p.m.w : kind === 'gold' ? p.m.g : kind === 'stone' ? p.m.s : kind === 'fish' ? p.m.fish : kind === 'carcass' ? p.m.hunt : p.m.berry;
    const amt = Math.min(n.amt, D.GATHER[kind] * mod * p.m.gather * dt); u.carry += amt; n.amt -= amt;
    if ((G.tick + u.id) % 26 === 0) G.ev('work', { wk: u.wk, x: n.x, y: n.y, owner: u.owner, id: u.id });
    if (n.amt <= 0.001) G.removeRes(n);
    if (u.carry >= cap) { u.carry = cap; u.st = 'return'; u.path = null; }
  };
  Gp._returnTick = function (u, s, dt) {
    const G = this, p = G.players[u.owner];
    let b = u.dropTo ? G.ents.get(u.dropTo) : null; if (b && (b.dead || !b.done)) b = null;
    if (!b || (G.tick + u.id) % 40 === 0) { const nb = G.dropFor(u.owner, u.ct, u.x, u.y, u.naval); if (!b || (nb && nb !== b && G.edgeDist(u, nb) + 1 < G.edgeDist(u, b))) b = nb; }
    if (!b) { u.anim = 'idle'; u.idleT += dt; return; }
    u.dropTo = b.id;
    if (G.edgeDist(u, b) <= 0.65) { u.hug = 0; u.rp2 = 0;
      const amt = Math.floor(u.carry * 100) / 100; p.res[u.ct] += amt; p.stats.gathered[u.ct] += amt; u.carry = 0; u.path = null; u.dropTo = 0;
      G.ev('drop', { owner: u.owner, rk: u.ct, x: u.x, y: u.y, amt });
      if (u.node && G.ents.get(u.node)) u.st = 'gather'; else { const rep = u.lastKind && u.lastKind !== 'farm' ? G.findNode(u, u.lastKind, u.lx || u.x, u.ly || u.y, 9) : null; if (rep) { u.node = rep.id; u.st = 'gather'; } else u.st = 'idle'; }
      return;
    }
    if (G._approach(u, s, b, dt) === 'fail') { u.dropTo = 0; u.anim = 'idle'; }
  };
  Gp._buildTick = function (u, s, dt) {
    const G = this, p = G.players[u.owner]; let b = G.ents.get(u.task);
    const next = () => {
      if (u.queueB) { while (u.queueB.length) { const nb = G.ents.get(u.queueB[0]); if (nb && !nb.done) { u.task = nb.id; return true; } u.queueB.shift(); } }
      // help with another foundation nearby
      let best = null, bd = 64; for (const o of G.blds) if (o.owner === u.owner && !o.done && o !== b) { const d = U.d2(o.x, o.y, u.x, u.y); if (d < bd) { bd = d; best = o; } }
      if (best) { u.task = best.id; return true; }
      return false;
    };
    if (!b || b.dead || b.owner !== u.owner) { if (!next()) u.st = 'idle'; return; }
    const bs = G.bstat(b.owner, b.type);
    if (b.done && b.hp >= bs.hp) {
      const bt = b.type; const was = b;
      if (next()) return;
      // after-build behaviour: gather from what we just built for
      u.st = 'idle'; u.task = 0;
      if (bt === 'farm' && !was.farmer) { G.cmdGather([u.id], was.id, {}); return; }
      const want = bt === 'lumbercamp' ? 'tree' : bt === 'miningcamp' ? (G.findNode(u, 'gold', was.x, was.y, 6) ? 'gold' : 'stone') : bt === 'mill' ? 'berry' : null;
      if (want) { const n = G.findNode(u, want, was.x, was.y, 8); if (n) { u.st = 'gather'; u.node = n.id; } }
      return;
    }
    const d = G.edgeDist(u, b);
    if (d > 0.62) { if (G._approach(u, s, b, dt) === 'fail') { u.st = 'idle'; } return; }
    u.hug = 0; u.rp2 = 0;
    u.path = null; u.anim = 'work'; u.wk = 'build'; u.work = true; u.dir = Math.atan2(b.y - u.y, b.x - u.x);
    b.bcount = (b.bcount || 0) + 1;
    if (!b.done) {
      if (b.prog === 0) { // push units out of the footprint
        for (const o of G.units) if (!o.naval && o.x > b.tx - 0.1 && o.x < b.tx + b.size + 0.1 && o.y > b.ty - 0.1 && o.y < b.ty + b.size + 0.1 && !D.BUILD[b.type].walk) G._unstick(o);
      }
      const n = Math.max(1, b.lastBuilders || 1), rate = p.m.buildSpd / D.BUILD[b.type].time * Math.pow(n, -0.3);
      const dp = rate * dt; b.prog = Math.min(1, b.prog + dp); b.hp = Math.min(bs.hp, b.hp + bs.hp * dp);
      if ((G.tick + u.id) % 18 === 0) G.ev('work', { wk: 'build', x: b.x, y: b.y, owner: u.owner, id: u.id });
      if (b.prog >= 1) { b.hpFrac = b.hp / bs.hp; G._completed(b); }
    } else {
      b.hp = Math.min(bs.hp, b.hp + bs.hp / (D.BUILD[b.type].time * 3) * dt);
      if ((G.tick + u.id) % 18 === 0) G.ev('work', { wk: 'build', x: b.x, y: b.y, owner: u.owner, id: u.id });
    }
  };

  /* ------------------------------ buildings ------------------------------ */
  Gp._spawnNear = function (b, type) {
    const G = this, naval = !!D.UNITS[type].naval, pass = naval ? G.passW : G.pass; const rx = b.rally ? b.rally.x : b.x + 2, ry = b.rally ? b.rally.y : b.y + 3;
    let best = null, bd = 1e9;
    for (let r = 0; r < 4 && !best; r++) for (let y = b.ty - 1 - r; y <= b.ty + b.size + r; y++) for (let x = b.tx - 1 - r; x <= b.tx + b.size + r; x++) {
      if (x < 0 || y < 0 || x >= G.w || y >= G.h) continue; if (x >= b.tx && x < b.tx + b.size && y >= b.ty && y < b.ty + b.size) continue;
      if (!pass[y * G.w + x]) continue; const d = U.d2(x + 0.5, y + 0.5, rx, ry); if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
    }
    return best;
  };
  Gp._bldTick = function (b, dt) {
    const G = this, p = G.players[b.owner];
    b.lastBuilders = b.bcount || 0; b.bcount = 0;
    if (!b.done) return;
    if (b.queue.length) {
      const q = b.queue[0];
      if (q.unit && q.t === 0) { if (p.pop >= p.popCap) { if (!p.housed) { p.housed = true; G.ev('housed', { owner: b.owner, x: b.x, y: b.y }); } return; } p.housed = false; q.t = 1e-6; G._recountPop(b.owner); }
      q.t += dt;
      if (q.t >= q.T) {
        b.queue.shift();
        if (q.unit) {
          const pos = G._spawnNear(b, q.unit);
          if (pos) {
            const u = G.spawnUnit(q.unit, b.owner, pos[0], pos[1]); u.dir = Math.PI / 4;
            G.ev('trained', { owner: b.owner, ut: q.unit, x: u.x, y: u.y, id: u.id });
            if (b.rally) {
              const t = b.rally.id ? G.ents.get(b.rally.id) : null;
              if (t && (t.k === 'r' || (t.k === 'b' && t.type === 'farm') || t.type === 'deer') && (u.type === 'villager' || u.type === 'fishboat')) G.cmdGather([u.id], t.id, {});
              else if (t && t.k === 'b' && !t.done && u.type === 'villager') G.cmdRepair([u.id], t.id, {});
              else G.cmdMove([u.id], b.rally.x, b.rally.y, {});
            }
          } else { G._refund(p, q.cost, 1); }
          G._recountPop(b.owner);
        } else if (q.tech) G._researched(b.owner, q.tech);
      }
    }
    const bd = D.BUILD[b.type];
    if (bd.atk) {
      b.cd -= dt;
      if (b.cd <= 0) {
        const s = G.bstat(b.owner, b.type), R = s.atk.range + b.size / 2; let best = null, bs = 1e9;
        G.near(b.x, b.y, R, (t) => { if (t.owner < 0 || !G.enemy(b.owner, t.owner) || !G.visibleTo(b.owner, t)) return; const d = Math.hypot(t.x - b.x, t.y - b.y); if (d > R) return; const sc = d - (t.st === 'attack' ? 2 : 0); if (sc < bs) { bs = sc; best = t; } });
        if (best) { b.cd = s.atk.rate; G._shoot(b, { atk: s.atk.dmg, dmg: 'p', bonus: {}, range: s.atk.range }, best, 'arrow'); }
        else b.cd = 0.3;
      }
    }
  };
  Gp._researched = function (o, key) {
    const G = this, p = G.players[o], t = D.TECH[key];
    const before = {}; for (const u of G.units) if (u.owner === o) before[u.type] = before[u.type] || G.ustat(o, u.type).hp;
    const bBefore = {}; for (const b of G.blds) if (b.owner === o) bBefore[b.type] = bBefore[b.type] || G.bstat(o, b.type).hp;
    p.techs[key] = true; p.techOrder.push(key); p.stats.techs++;
    if (t.fx) t.fx(p);
    if (t.ageUp) { p.age = t.ageUp; p.stats.ageT[p.age] = G.time; }
    p.ver++; p.sc = {};
    for (const u of G.units) if (u.owner === o && before[u.type]) { const nh = G.ustat(o, u.type).hp; if (nh !== before[u.type]) u.hp = u.hp * nh / before[u.type]; }
    for (const b of G.blds) if (b.owner === o && bBefore[b.type]) { const nh = G.bstat(o, b.type).hp; if (nh !== bBefore[b.type]) b.hp = b.hp * nh / bBefore[b.type]; }
    G.ev(t.ageUp ? 'ageUp' : 'researched', { owner: o, key, age: p.age });
  };

  /* ------------------------------ vision, victory, stats ------------------------------ */
  Gp.updateVision = function (force) {
    const G = this, w = G.w, h = G.h;
    for (const p of G.players) {
      if (!p.alive && !force) continue; const vis = p.vis; vis.fill(0);
      const stamp = (x, y, r) => { const o = CIRC[Math.min(14, Math.max(1, Math.round(r)))], tx = Math.floor(x), ty = Math.floor(y); for (let k = 0; k < o.length; k += 2) { const xx = tx + o[k], yy = ty + o[k + 1]; if (xx >= 0 && yy >= 0 && xx < w && yy < h) vis[yy * w + xx] = 1; } };
      for (const u of G.units) if (u.owner >= 0 && G.players[u.owner].team === p.team) stamp(u.x, u.y, G.ustat(u.owner, u.type).los);
      for (const b of G.blds) if (G.players[b.owner].team === p.team) stamp(b.x, b.y, (b.done ? D.BUILD[b.type].los : 1) + b.size / 2);
      if (G.opts.reveal === 'all' && p.human) vis.fill(1);
      const exp = p.exp; for (let i = 0; i < vis.length; i++) if (vis[i]) exp[i] = 1;
      if (G.opts.reveal === 'explored' && p.human && !G._revealed) { exp.fill(1); }
    }
    if (G.opts.reveal === 'explored') G._revealed = true;
  };
  const KEYB = { towncenter: 1, barracks: 1, archery: 1, stable: 1, siegeworks: 1, dock: 1, market: 1, blacksmith: 1, academy: 1, tower: 1, wonder: 1 };
  Gp._checkVictory = function () {
    const G = this; if (G.over) return;
    for (const p of G.players) {
      if (!p.alive) continue; let alive = false;
      for (const u of G.units) if (u.owner === p.id) { alive = true; break; }
      if (!alive) for (const b of G.blds) if (b.owner === p.id && KEYB[b.type]) { alive = true; break; }
      if (!alive && !G.opts.noDefeat) { p.alive = false; G.ev('defeated', { owner: p.id }); for (const b of G.blds.slice()) if (b.owner === p.id) G.removeBuilding(b); }
    }
    const teams = new Set(G.players.filter(p => p.alive).map(p => p.team));
    if (teams.size <= 1 && G.players.length > 1 && !G.opts.noConquest) { G.over = true; G.winner = teams.size ? [...teams][0] : -1; G.winHow = 'conquest'; G.ev('gameOver', { team: G.winner, how: 'conquest' }); }
  };
  Gp.score = function (p) { const g = p.stats.gathered; return Math.round((g.f + g.w + g.g * 1.5 + g.s * 1.5) / 10 + p.stats.kills * 6 + p.stats.razed * 25 + p.stats.techs * 15 + p.age * 120 + (p.wonderT >= 0 ? 300 : 0)); };
  Gp.armyOf = function (o) { let n = 0; for (const u of this.units) if (u.owner === o && isMil(u.type)) n++; return n; };
  Gp._sample = function () {
    const G = this;
    for (const p of G.players) {
      let vil = 0, mil = 0; for (const u of G.units) if (u.owner === p.id) { if (u.type === 'villager' || u.type === 'fishboat') vil++; else mil++; }
      const g = p.stats.gathered; p.stats.maxArmy = Math.max(p.stats.maxArmy, mil);
      p.stats.timeline.push({ t: Math.round(G.time), score: G.score(p), pop: p.pop, vil, mil, gath: Math.round(g.f + g.w + g.g + g.s), age: p.age });
    }
  };

  /* ------------------------------ main step ------------------------------ */
  Gp.step = function () {
    const G = this; if (G.over && !G.opts.continueAfter) return;
    const dt = DT; G.tick++; G.time += dt;
    for (const u of G.units) { u.px = u.x; u.py = u.y; }
    G.hashUnits();
    for (const b of G.blds.slice()) if (!b.dead) G._bldTick(b, dt);
    const us = G.units.slice(); for (const u of us) if (!u.dead) G._unitTick(u, dt);
    if (G.tick % 2 === 0) { G.hashUnits(); G._separate(); }
    for (let i = G.projs.length - 1; i >= 0; i--) { const pj = G.projs[i]; pj.t += dt; if (pj.t >= pj.T) { G.projs.splice(i, 1); G._land(pj); } }
    if (G.tick % 10 === 0) { for (const r of G.res) r.gatherers = 0; for (const u of G.units) if ((u.st === 'gather' || u.st === 'return') && u.node) { const n = G.ents.get(u.node); if (n && n.k === 'r') n.gatherers++; } }
    if (G.tick % 5 === 0) G.updateVision();
    if (G.tick % 20 === 0) G._checkVictory();
    for (const p of G.players) if (p.wonderT >= 0 && p.alive) {
      let has = false; for (const b of G.blds) if (b.owner === p.id && b.type === 'wonder' && b.done) { has = true; break; }
      if (!has) { p.wonderT = -1; continue; }
      p.wonderT -= dt; if (p.wonderT <= 0 && !G.over) { G.over = true; G.winner = p.team; G.winHow = 'wonder'; G.ev('gameOver', { team: p.team, how: 'wonder' }); }
    }
    if (G.tick % 400 === 1) G._sample();
    for (let i = 0; i < G.ais.length; i++) { const ai = G.ais[i]; if ((G.tick + i * 3) % 10 === 0 && G.players[ai.pid].alive) ai.update(G); }
    if (G.script) G.script(G);
  };
  Gp.run = function (seconds) { const n = Math.round(seconds / DT); for (let i = 0; i < n && (!this.over || this.opts.continueAfter); i++) this.step(); };

  /* ------------------------------ save / load ------------------------------ */
  Gp.serialize = function () {
    const G = this; const q8 = new Int8Array(G.height.length); for (let i = 0; i < q8.length; i++) q8[i] = Math.max(-127, Math.min(127, Math.round(G.height[i] * 100)));
    const strip = (e) => { const o = {}; for (const k in e) { if (k === 'path' || k === 'flow' || k === 'nextCmd') continue; o[k] = e[k]; } return o; };
    return {
      v: 1, opts: Object.assign({}, G.opts, { map: null }), time: G.time, tick: G.tick, nextId: G.nextId, rng: G.rng.state(), w: G.w, h: G.h, mapType: G.map.type, mapSeed: G.map.seed,
      terr: b64.enc(G.terr), height: b64.enc(new Uint8Array(q8.buffer)), over: G.over, winner: G.winner,
      players: G.players.map(p => ({ id: p.id, name: p.name, color: p.color, ai: p.ai, team: p.team, human: p.human, res: p.res, age: p.age, techOrder: p.techOrder, tier: p.tier, alive: p.alive, wonderT: p.wonderT, prices: p.prices, stats: p.stats, exp: b64.enc(p.exp), startX: p.startX, startY: p.startY, formation: p.formation, autoFarm: p.autoFarm })),
      units: G.units.map(strip), blds: G.blds.map(strip), res: G.res.map(strip), decals: G.decals.slice(-400), projs: [],
      ais: G.ais.map(a => a.save ? a.save() : null), scen: G.scenState || null
    };
  };
  E.Game.load = function (S) {
    const terr = b64.dec(S.terr), hq = new Int8Array(b64.dec(S.height).buffer), height = new Float32Array(hq.length); for (let i = 0; i < hq.length; i++) height[i] = hq[i] / 100;
    const map = { w: S.w, h: S.h, terr, height, res: [], starts: [], deer: [], type: S.mapType, seed: S.mapSeed, size: S.w };
    const opts = Object.assign({}, S.opts, { map, noSetup: true, players: S.players.map(p => ({ name: p.name, color: p.color, ai: p.ai, team: p.team, human: p.human })) });
    const G = new E.Game(opts);
    G.time = S.time; G.tick = S.tick; G.nextId = S.nextId; G.rng.setState(S.rng); G.over = S.over; G.winner = S.winner;
    S.players.forEach((sp, i) => {
      const p = G.players[i]; p.res = sp.res; p.tier = sp.tier; p.alive = sp.alive; p.wonderT = sp.wonderT; p.prices = sp.prices; p.stats = sp.stats; p.human = sp.human; p.startX = sp.startX; p.startY = sp.startY; p.formation = sp.formation; p.autoFarm = sp.autoFarm;
      p.exp = b64.dec(sp.exp);
      for (const k of sp.techOrder) { p.techs[k] = true; p.techOrder.push(k); const t = D.TECH[k]; if (t.fx) t.fx(p); }
      p.tier = sp.tier; p.age = sp.age; p.ver++; p.sc = {};
    });
    for (const r of S.res) { const n = G.addRes(r.type, r.tx, r.ty, r.amt, r.v); G.ents.delete(n.id); Object.assign(n, r); G.ents.set(n.id, n); }
    for (const b of S.blds) { const nb = G.placeBuilding(b.type, b.owner, b.tx, b.ty, false); G.ents.delete(nb.id); Object.assign(nb, b); G.ents.set(nb.id, nb); }
    for (const u of S.units) { const nu = G.spawnUnit(u.type, u.owner, u.x, u.y); G.ents.delete(nu.id); Object.assign(nu, u); nu.path = null; nu.flow = null; G.ents.set(nu.id, nu); if (nu.st === 'move' && nu.type !== 'deer') G._goTo(nu, nu.gx, nu.gy); }
    G.players.forEach((p) => { p.stats = S.players[p.id].stats; G._recountPop(p.id); });
    G.decals = S.decals || [];
    G.nextId = S.nextId; G._aiSaves = S.ais; G.scenState = S.scen;
    G.updateVision(true);
    return G;
  };
  E.Game.isMil = isMil;
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
