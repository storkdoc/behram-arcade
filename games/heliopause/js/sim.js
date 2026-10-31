/* HELIOPAUSE — deterministic simulation. No DOM. Runs in the browser and headless in Node. */
(function (root) {
'use strict';
var D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.HPD;
var TAU = D.TAU, T = D.TOWERS, A = D.ALIENS;

function rng32(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function sunFactor(x, y) { var r = Math.sqrt(x * x + y * y); return clamp(Math.pow(D.EARTH_R / Math.max(r, 30), 2), 0.12, 4); }

function Sim(o) {
  o = o || {};
  this.sectorIdx = o.sector === 'endless' ? -1 : (o.sector | 0);
  this.sector = this.sectorIdx < 0 ? D.ENDLESS : D.SECTORS[this.sectorIdx];
  this.diffId = o.diff || 'commander'; this.diff = D.DIFF[this.diffId];
  this.perks = o.perks || {};
  this.fx = o.fx !== false;
  this.ev = [];
  this.t = 0; this.wt = 0;                 // orbital time; time within the current wave
  this.mode = 'build';                    // build | wave | won | lost
  this.w = 0;                             // waves completed
  var pk = this.perks;
  this.metals = Math.round(this.sector.start.m * (1 + 0.12 * (pk.metals || 0)) * this.diff.inc);
  this.science = this.sector.start.s + 15 * (pk.science || 0);
  this.earthMax = this.diff.earth + 8 * (pk.earth || 0); this.earthHp = this.earthMax;
  this.esh = 0; this.eshMax = 0;
  this.research = {}; this.kills = {}; this.structs = {};
  this.aliens = []; this.projs = []; this.spawnQ = [];
  this.superCharge = 25 * (pk.super || 0); this.sunfire = null;
  this.score = 0; this.stats = { kills: 0, leaked: 0, built: 0, dmgEarth: 0 };
  this.nid = 1; this.gridCd = 0; this.siegeCd = {};
  this.bp = {}; this.computeBodies();
  this.energy(); this.preview = this.genWave(1);
}
var P = Sim.prototype;

/* ---------- geometry ---------- */
P.computeBodies = function () {
  var t = this.t, bp = this.bp;
  for (var i = 0; i < D.BODIES.length; i++) {
    var b = D.BODIES[i], x, y;
    if (b.id === 'sun') { x = 0; y = 0; }
    else if (b.lag) { var pb = D.BODY[b.lag], a = pb.a0 + TAU * t / pb.period + b.ang; x = Math.cos(a) * pb.orbit; y = Math.sin(a) * pb.orbit; }
    else { var a2 = b.a0 + TAU * t / b.period, cx = 0, cy = 0; if (b.parent) { cx = bp[b.parent].x; cy = bp[b.parent].y; } x = cx + Math.cos(a2) * b.orbit; y = cy + Math.sin(a2) * b.orbit; }
    var o = bp[b.id] || (bp[b.id] = {}); o.x = x; o.y = y;
  }
};
P.bodyAt = function (id, t) {
  var b = D.BODY[id];
  if (b.id === 'sun') return { x: 0, y: 0 };
  if (b.lag) { var pb = D.BODY[b.lag], a = pb.a0 + TAU * t / pb.period + b.ang; return { x: Math.cos(a) * pb.orbit, y: Math.sin(a) * pb.orbit }; }
  var c = b.parent ? this.bodyAt(b.parent, t) : { x: 0, y: 0 }, a2 = b.a0 + TAU * t / b.period;
  return { x: c.x + Math.cos(a2) * b.orbit, y: c.y + Math.sin(a2) * b.orbit };
};
P.siteAt = function (id, t) { var s = D.SITE[id], b = this.bodyAt(s.body, t); return { x: b.x + Math.cos(s.off[1]) * s.off[0], y: b.y + Math.sin(s.off[1]) * s.off[0] }; };
/* Projected approach paths for the next wave: a ghost cruiser per vector, flown against the moving Earth. */
P.ghostPaths = function (wave) {
  wave = wave || this.preview; var out = [], seen = {}, self = this;
  wave.groups.forEach(function (g) {
    if (seen[g.vec]) return; seen[g.vec] = 1;
    var v = D.VECTORS[g.vec], x = Math.cos(v.ang) * D.HELIO_R, y = Math.sin(v.ang) * D.HELIO_R, t = self.t + g.delay, pts = [], dt = 0.5, spd = 19;
    for (var i = 0; i < 400; i++) {
      var e = self.bodyAt('earth', t), dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
      pts.push({ x: x, y: y, t: t });
      if (d < 10) break;
      var f = clamp((d - 40) / 330, 0, 1), ang = v.curl * f, c = Math.cos(ang), s = Math.sin(ang);
      var ux = (dx * c - dy * s) / d, uy = (dx * s + dy * c) / d, rr = Math.hypot(x, y);
      if (rr < 48) { var push = (48 - rr) / 48 * 2; ux += x / rr * push; uy += y / rr * push; var ul = Math.hypot(ux, uy); ux /= ul; uy /= ul; }
      x += ux * spd * dt; y += uy * spd * dt; t += dt;
    }
    out.push({ vec: g.vec, pts: pts });
  });
  return out;
};
/* How many seconds of the projected paths a tower at this site would cover. */
P.coverage = function (sid, rng, paths) {
  paths = paths || this.ghostPaths(); var n = 0;
  for (var i = 0; i < paths.length; i++) { var pts = paths[i].pts; for (var j = 0; j < pts.length; j += 2) { var p = pts[j], s = this.siteAt(sid, p.t); if ((p.x - s.x) * (p.x - s.x) + (p.y - s.y) * (p.y - s.y) < rng * rng) n++; } }
  return n;
};
P.sitePos = function (id) { var s = D.SITE[id], b = this.bp[s.body]; return { x: b.x + Math.cos(s.off[1]) * s.off[0], y: b.y + Math.sin(s.off[1]) * s.off[0] }; };
P.earth = function () { return this.bp.earth; };

/* ---------- research ---------- */
P.has = function (id) { return !!this.research[id]; };
P.researchState = function (id) {
  var r = D.RES[id]; if (!r) return 'none';
  if (this.research[id]) return 'done';
  if (this.sector.res.indexOf(id) < 0) return 'locked';
  if (r.excl) for (var k in this.research) if (D.RES[k].excl === r.excl) return 'excluded';
  if (r.req) for (var i = 0; i < r.req.length; i++) if (!this.research[r.req[i]]) return 'prereq';
  if (r.spec) for (var s in r.spec) if ((this.kills[s] || 0) < r.spec[s]) return 'specimen';
  return this.science >= r.cost ? 'ready' : 'poor';
};
P.doResearch = function (id) {
  if (this.researchState(id) !== 'ready') return false;
  var r = D.RES[id]; this.science -= r.cost; this.research[id] = 1;
  if (id === 'D1') { this.earthMax += 30; this.earthHp += 30; }
  if (id === 'S5') for (var k in this.structs) { var st = this.structs[k]; if (T[st.type].cls === 'eco') { st.hpMax = Math.round(st.hpMax * 1.6); st.hp = Math.round(st.hp * 1.6); } }
  this.energy(); this.emit({ k: 'research', id: id }); return true;
};

/* ---------- building ---------- */
P.costMul = function () { return this.has('E4') ? 0.85 : 1; };
P.buildCost = function (type) { return Math.round(T[type].cost * this.costMul()); };
P.siteReachable = function (sid) { var s = D.SITE[sid]; return !s.reach || this.has(s.reach); };
P.towerUnlocked = function (type) { var r = T[type].req; return !r || this.has(r); };
P.canBuild = function (sid, type) {
  var s = D.SITE[sid], d = T[type];
  if (!s || !d || this.structs[sid] || !this.siteReachable(sid) || !this.towerUnlocked(type)) return false;
  if (s.kinds.indexOf(d.kind) < 0) return false;
  return this.metals >= this.buildCost(type);
};
P.build = function (sid, type) {
  if (!this.canBuild(sid, type)) return false;
  var c = this.buildCost(type), d = T[type];
  this.metals -= c;
  var hp = d.cls === 'eco' ? (this.has('S5') ? 160 : 100) : 140;
  this.structs[sid] = { site: sid, type: type, lv: 0, br: null, hp: hp, hpMax: hp, cd: 0.3, prio: 'first', dis: 0, inv: c, ramp: 1, rampT: -1, beam: null, drones: null };
  this.stats.built++; this.energy(); this.emit({ k: 'build', site: sid, type: type }); return true;
};
P.upgradeInfo = function (sid) {
  var st = this.structs[sid]; if (!st) return null; var d = T[st.type];
  if (st.lv < d.lv.length - 1) return { kind: 'lv', cost: Math.round(d.lv[st.lv + 1].c * this.costMul()), next: d.lv[st.lv + 1] };
  if (d.br && !st.br) return { kind: 'br', A: Math.round(d.br.A.c * this.costMul()), B: Math.round(d.br.B.c * this.costMul()) };
  return null;
};
P.upgrade = function (sid, br) {
  var st = this.structs[sid], u = this.upgradeInfo(sid); if (!u) return false;
  var cost = u.kind === 'lv' ? u.cost : u[br]; if (!cost || this.metals < cost) return false;
  this.metals -= cost; st.inv += cost;
  if (u.kind === 'lv') st.lv++; else st.br = br;
  st.hpMax += 30; st.hp = st.hpMax;
  this.energy(); this.emit({ k: 'upgrade', site: sid }); return true;
};
P.sellValue = function (sid) { var st = this.structs[sid]; return st ? Math.round(st.inv * (this.mode === 'build' ? 0.75 : 0.6)) : 0; };
P.sell = function (sid) { var st = this.structs[sid]; if (!st) return false; this.metals += this.sellValue(sid); delete this.structs[sid]; this.energy(); this.emit({ k: 'sell', site: sid }); return true; };
P.setPrio = function (sid, p) { var st = this.structs[sid]; if (st) st.prio = p; };
P.stats_ = function (st) {
  var d = T[st.type], s = {}, k, l = d.lv[st.lv];
  for (k in l) s[k] = l[k];
  if (st.br) { var b = d.br[st.br]; for (k in b) s[k] = b[k]; }
  return s;
};
P.towerStats = P.stats_;

/* energy grid & earth shield */
P.energy = function () {
  var cap = 12 + (this.has('E3') ? 8 : 0), use = 0, solarMul = (this.has('E3') ? 1.2 : 1) * (this.has('E5') ? 2 : 1), sh = 0;
  var e = this.bp.earth;
  for (var sid in this.structs) {
    var st = this.structs[sid], d = T[st.type], s = this.stats_(st), p = this.sitePos(sid);
    if (st.type === 'solar') cap += s.e * sunFactor(p.x, p.y) * solarMul;
    use += d.pw + (this.has('W6') && d.kind === 'T' && d.pw > 0 ? 1 : 0);
    if (st.type === 'aegis' && Math.hypot(p.x - e.x, p.y - e.y) < 46) sh += s.sh;
  }
  this.ecap = Math.round(cap * 10) / 10; this.euse = use; this.eshMax = sh; if (this.esh > sh) this.esh = sh;
  this.pf = use > cap ? Math.pow(cap / use, 1.25) : 1;
};
P.income = function () {
  var m = 2.2, s = 0.25 * (this.has('E5') ? 1.5 : 1);
  for (var sid in this.structs) {
    var st = this.structs[sid], site = D.SITE[sid], sy = site.y || {};
    if (st.type === 'mine') {
      var b = site.body, mul = (sy.M || 1);
      if (this.has('E1') && (b === 'moon' || b === 'mars' || b === 'mercury')) mul *= 1.4;
      if (this.has('E2') && (D.BODY[b].rock || b === 'jl4' || b === 'jl5')) mul *= 1.5;
      m += this.stats_(st).y * mul;
    } else if (st.type === 'lab') s += this.stats_(st).s * (sy.L || 1);
  }
  return { m: m * this.diff.inc, s: s };
};

/* ---------- waves ---------- */
P.hpMul = function (w) {
  var W = this.sectorIdx < 0 ? w * 1.15 + 3 : w + this.sectorIdx * 0.45;
  return this.diff.hp * (1 + 0.075 * W + 0.0042 * W * W);
};
P.genWave = function (w) {
  var sec = this.sector, si = this.sectorIdx < 0 ? Math.min(11, 2 + (w / 5 | 0)) : this.sectorIdx;
  var rnd = rng32((this.sectorIdx + 7) * 7919 + w * 104729);
  var budget = (12 + 6.5 * w + 0.62 * w * w) * (1 + 0.05 * si);
  if (sec.endless) budget = (16 + 7 * w + 0.75 * w * w);
  var introAt = {}; for (var k in sec.intro) introAt[sec.intro[k]] = +k;
  var capCost = w <= 2 ? 4.5 : w <= 4 ? 9.5 : 99;
  var avail = sec.pool.filter(function (t) { return (!(t in introAt) || introAt[t] <= w) && (A[t].cost <= capCost || introAt[t] === w); });
  if (sec.endless) avail = avail.filter(function (t) { var g = { aegis: 3, dread: 4, hydra: 5, phantom: 6, carrier: 8, mender: 7, prism: 9, siege: 10, raider: 2 }; return !g[t] || w >= g[t]; });
  var groups = [], intro = sec.intro[w], boss = sec.boss && sec.boss[w];
  if (sec.endless && w % 10 === 0) boss = w >= 30 && w % 30 === 0 ? 'elder' : (w % 20 === 0 ? 'monolith' : 'leviathan');
  var vecs = sec.vec, pickVec = function (i) { return w <= 2 ? vecs[0] : vecs[(rnd() * Math.min(vecs.length, 1 + (w / 2 | 0))) | 0]; };
  if (boss) { groups.push({ type: boss, n: 1, vec: pickVec(0), delay: 6, gap: 1, isNew: true }); budget *= 0.55; }
  var ng = Math.min(1 + Math.floor((w + 1) / 3), 4);
  var shares = [];
  if (intro) { groups.push({ type: intro, share: 0.5, isNew: true }); ng = Math.max(1, ng - 1); }
  for (var i = 0; i < ng; i++) {
    // weight recently-introduced / tougher types as waves grow
    var tot = 0, ws = avail.map(function (t) { var c = A[t].cost; var wv = t === 'drone' ? 1.2 : 1 + Math.min(w / 6, 1.5) * (c > 5 ? 1 : 0.3); tot += wv; return wv; });
    var r = rnd() * tot, ti = 0; while (r > ws[ti] && ti < ws.length - 1) { r -= ws[ti]; ti++; }
    groups.push({ type: avail[ti], share: (intro ? 0.5 : 1) / ng });
  }
  var t0 = boss ? 14 : 0;
  for (var g = boss ? 1 : 0; g < groups.length; g++) {
    var gr = groups[g], ad = A[gr.type], n = Math.max(1, Math.round(budget * gr.share / ad.cost));
    if (gr.type === 'drone') n = Math.max(n, 6);
    gr.n = n; gr.vec = pickVec(g); gr.gap = ad.cost < 1 ? 0.2 : ad.cost < 2 ? 0.32 : ad.cost < 6 ? 0.95 : ad.cost < 12 ? 1.8 : 3.2;
    gr.delay = t0 + rnd() * 3; t0 = gr.delay + Math.min(n * gr.gap * 0.6, 14) + 2;
    delete gr.share;
  }
  // merge duplicate type+vector groups
  var out = [];
  groups.forEach(function (gg) { var m = out.filter(function (o) { return o.type === gg.type && o.vec === gg.vec; })[0]; if (m) m.n += gg.n; else out.push(gg); });
  return { w: w, groups: out, hpMul: this.hpMul(w), boss: boss || null, last: !sec.endless && w >= sec.waves };
};
P.startWave = function () {
  if (this.mode !== 'build') return false;
  var wv = this.genWave(this.w + 1); this.cur = wv; this.mode = 'wave'; this.wt = 0;
  this.spawnQ = [];
  for (var i = 0; i < wv.groups.length; i++) { var g = wv.groups[i]; for (var j = 0; j < g.n; j++) this.spawnQ.push({ at: g.delay + j * g.gap, type: g.type, vec: g.vec, k: j }); }
  this.spawnQ.sort(function (a, b) { return a.at - b.at; });
  this.esh = this.eshMax;
  this.emit({ k: 'waveStart', w: wv.w, boss: wv.boss });
  return true;
};
P.spawn = function (type, vec, x, y, k) {
  var ad = A[type], hm = this.cur ? this.cur.hpMul : 1, v = D.VECTORS[vec] || { ang: 0, curl: 0.5 };
  if (x === undefined) {
    var j = ((k || 0) % 5 - 2) * 0.035 + (Math.sin((k || 0) * 12.9898 + this.nid) * 0.02);
    x = Math.cos(v.ang + j) * D.HELIO_R; y = Math.sin(v.ang + j) * D.HELIO_R;
  }
  var bossHm = ad.boss ? Math.sqrt(hm) * (this.sectorIdx < 0 ? 1 + this.w / 40 : 1) : hm;
  var a = { id: this.nid++, type: type, x: x, y: y, hp: ad.hp * bossHm, hpMax: ad.hp * bossHm, sh: (ad.sh || 0) * hm, shMax: (ad.sh || 0) * hm,
    spd: ad.spd * (0.94 + ((this.nid * 37) % 13) / 100), curl: v.curl, vec: vec, slow: 0, stun: 0, confuse: 0, burn: 0, lastHit: -9, spawnT: ad.spawnT || 0,
    alive: true, de: 999, rev: !ad.cloak, open: false, cyc: 0, pulse: 7, sieging: false, tgt: null, hx: 0, hy: 0, phase: 0, frozen: 0 };
  this.aliens.push(a); return a;
};

/* ---------- damage ---------- */
P.dmgMul = function (st, p) {
  var m = 1, d = T[st.type], cls = (st.br && d.br[st.br].cls) || d.cls;
  if (cls === 'kin' && this.has('W3')) m *= 1.25;
  if (cls === 'exp') { if (this.has('W2')) m *= 1.25; if (this.has('W5')) m *= 1.35; }
  var e = this.bp.earth;
  if (this.has('D1') && Math.hypot(p.x - e.x, p.y - e.y) < 60) m *= 1.25;
  if (this.has('D2') && Math.hypot(p.x, p.y) > 185) m *= 1.2;
  return m;
};
P.hit = function (a, amt, cls, pierce, src) {
  if (!a.alive || amt <= 0) return;
  var ad = A[a.type];
  if ((a.type === 'drone' || a.type === 'raider') && this.has('B1')) amt *= 1.4;
  var res = (ad.res && ad.res[cls] !== undefined) ? ad.res[cls] : 1;
  if (res < 1 && this.has('B2')) res = 1 - (1 - res) * 0.5;
  if (pierce && res < 1) res = 1;
  if (ad.mono && !a.open) res *= ad.elder ? 0.32 : 0.12;
  if (a.sh > 0) {
    var sm = { kin: 0.5, las: 1.5, exp: 0.8, emp: 4, sol: 1.5, grav: 1 }[cls] || 1;
    var abs = Math.min(a.sh, amt * sm); a.sh -= abs; amt -= abs / sm;
  }
  a.hp -= amt * res; a.lastHit = this.t;
  if (src === 'super' || src === 'sun') a.lastHit = this.t;
  if (a.hp <= 0) this.kill(a, src);
};
P.kill = function (a, src) {
  a.alive = false; var ad = A[a.type];
  var bonus = (this.has('D2') && Math.hypot(a.x, a.y) > 185) ? 1.25 : 1;
  this.metals += Math.round(ad.bounty * bonus * this.diff.inc * (1 + Math.min(this.w, 20) * 0.02));
  this.science += ad.sci;
  this.kills[a.type] = (this.kills[a.type] || 0) + 1; if (ad.boss) this.kills.boss = (this.kills.boss || 0) + 1;
  this.stats.kills++; this.score += Math.round(ad.cost * 10);
  this.superCharge = Math.min(100, this.superCharge + ad.cost * 0.35 * (this.has('B5') ? 2 : 1));
  if (ad.split) for (var i = 0; i < ad.split; i++) { var c = this.spawn('drone', a.vec, a.x + Math.cos(i * 2.1) * 6, a.y + Math.sin(i * 2.1) * 6); c.curl = a.curl; }
  this.emit({ k: 'kill', type: a.type, x: a.x, y: a.y, boss: !!ad.boss, r: ad.r });
};
P.damageEarth = function (n, kind) {
  if (this.esh > 0) { var ab = Math.min(this.esh, n); this.esh -= ab; n -= ab; this.emit({ k: 'shieldHit' }); }
  if (n > 0) { this.earthHp -= n; this.stats.dmgEarth += n; this.emit({ k: 'earthHit', n: n, kind: kind }); }
  if (this.earthHp <= 0) { this.earthHp = 0; this.mode = 'lost'; this.emit({ k: 'lost' }); }
};

/* ---------- super-weapon ---------- */
P.superKind = function () { return this.has('X1') ? 'sunfire' : this.has('X2') ? 'collapse' : 'barrage'; };
P.fireSuper = function () {
  if (this.mode !== 'wave' || this.superCharge < 100) return false;
  this.superCharge = 0; var k = this.superKind(), hm = this.cur.hpMul, mul = this.has('B5') ? 1.5 : 1, e = this.bp.earth, self = this;
  if (k === 'barrage') this.aliens.forEach(function (a) { if (a.alive && Math.hypot(a.x - e.x, a.y - e.y) < 165) self.hit(a, 280 * hm * mul, 'exp', false, 'super'); });
  else if (k === 'sunfire') this.sunfire = { r: 0, hit: {}, dmg: 300 * hm * mul };
  else this.aliens.forEach(function (a) {
    if (!a.alive) return; a.frozen = 6; var dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (!A[a.type].boss) { a.x += dx / d * 80; a.y += dy / d * 80; }
    self.hit(a, 120 * hm * mul, 'grav', false, 'super');
  });
  this.emit({ k: 'super', kind: k }); return true;
};

/* ---------- main step ---------- */
P.emit = function (e) { if (this.fx) this.ev.push(e); };
P.step = function (dt) {
  if (this.mode !== 'wave') return;
  this.t += dt; this.wt += dt; this.computeBodies();
  var e = this.bp.earth, self = this, i, a, ad;
  // economy
  var inc = this.income(); this.metals += inc.m * dt; this.science += inc.s * dt;
  this.superCharge = Math.min(100, this.superCharge + dt * 0.9 * (this.has('B5') ? 2 : 1));
  if (this.eshMax > 0) this.esh = Math.min(this.eshMax, this.esh + dt * 1.5);
  // spawns
  while (this.spawnQ.length && this.spawnQ[0].at <= this.wt) { var q = this.spawnQ.shift(); var na = this.spawn(q.type, q.vec, undefined, undefined, q.k); if (A[q.type].boss) this.emit({ k: 'boss', type: q.type }); this.emit({ k: 'spawn', type: q.type, x: na.x, y: na.y }); }
  // structures that matter to aliens
  var radars = [], aegis = [], outposts = [], towers = [];
  for (var sid in this.structs) {
    var st = this.structs[sid], p = this.sitePos(sid); st.x = p.x; st.y = p.y;
    if (st.dis > 0) st.dis -= dt;
    if (st.type === 'radar') radars.push(st); else if (st.type === 'aegis') aegis.push(st);
    if (T[st.type].cls === 'eco') outposts.push(st); else towers.push(st);
  }
  // alien pre-pass: reset fields, reveal
  for (i = 0; i < this.aliens.length; i++) {
    a = this.aliens[i]; if (!a.alive) continue; ad = A[a.type];
    a.slow = 0; a.de = Math.hypot(a.x - e.x, a.y - e.y);
    if (ad.cloak) { a.rev = a.de < 36; for (var r = 0; r < radars.length && !a.rev; r++) { var rs = this.stats_(radars[r]); if ((a.x - radars[r].x) * (a.x - radars[r].x) + (a.y - radars[r].y) * (a.y - radars[r].y) < rs.rng * rs.rng) a.rev = true; } }
  }
  // towers act
  for (i = 0; i < towers.length; i++) this.towerStep(towers[i], dt, radars);
  this.gridStep(dt);
  // sunfire wave
  if (this.sunfire) {
    var sf = this.sunfire; sf.r += 330 * dt;
    this.aliens.forEach(function (al) { if (al.alive && !sf.hit[al.id] && Math.hypot(al.x, al.y) < sf.r) { sf.hit[al.id] = 1; al.burn = Math.max(al.burn, 4); self.hit(al, sf.dmg, 'sol', false, 'sun'); } });
    if (sf.r > D.HELIO_R + 40) this.sunfire = null;
  }
  // projectiles
  this.projStep(dt);
  // aliens move & act
  var n0 = this.aliens.length;
  for (i = 0; i < n0; i++) { a = this.aliens[i]; if (a.alive) this.alienStep(a, dt, outposts, aegis); }
  // cleanup
  if (this.aliens.length > 0) { var keep = []; for (i = 0; i < this.aliens.length; i++) if (this.aliens[i].alive) keep.push(this.aliens[i]); this.aliens = keep; }
  // outposts destroyed
  for (sid in this.structs) if (this.structs[sid].hp <= 0) { this.emit({ k: 'destroyed', site: sid, type: this.structs[sid].type }); delete this.structs[sid]; this.energy(); }
  // wave end
  if (this.mode === 'wave' && !this.spawnQ.length && !this.aliens.length && !this.projs.length) this.endWave();
};
P.endWave = function () {
  this.w++; var w = this.w;
  this.metals += Math.round((35 + 5 * w) * this.diff.inc); this.science += 6 + w * 0.6;
  this.score += 100 * w;
  for (var sid in this.structs) { var st = this.structs[sid]; st.hp = Math.min(st.hpMax, st.hp + st.hpMax * 0.5); st.dis = 0; st.beam = null; st.drones = null; }
  this.projs = []; this.sunfire = null;
  if (this.cur.last) { this.mode = 'won'; this.score += Math.round(this.earthHp * 50); this.emit({ k: 'won' }); }
  else { this.mode = 'build'; this.preview = this.genWave(w + 1); this.emit({ k: 'waveEnd', w: w }); }
};
P.stars = function () { var f = this.earthHp / this.earthMax; return this.mode !== 'won' ? 0 : f >= 0.9 ? 3 : f >= 0.5 ? 2 : 1; };

P.visibleTo = function (a, st, rng) {
  if (a.rev) return true;
  if (this.has('B3')) { var dx = a.x - st.x, dy = a.y - st.y; return dx * dx + dy * dy < rng * rng * 0.25; }
  return false;
};
P.pickTarget = function (st, rng, excl) {
  var best = null, bv = 1e9, r2 = rng * rng;
  for (var i = 0; i < this.aliens.length; i++) {
    var a = this.aliens[i]; if (!a.alive) continue;
    var dx = a.x - st.x, dy = a.y - st.y, d2 = dx * dx + dy * dy; if (d2 > r2) continue;
    if (excl && excl.indexOf(a.id) >= 0) continue;
    if (!this.visibleTo(a, st, rng)) continue;
    var v = st.prio === 'strong' ? -(a.hp + a.sh) : st.prio === 'near' ? d2 : a.de;
    if (v < bv) { bv = v; best = a; }
  }
  return best;
};
P.rangeOf = function (st, s, radars) {
  var r = s.rng * (this.has('P6') ? 1.12 : 1);
  if (this.has('D2') && Math.hypot(st.x, st.y) > 185) r *= 1.2;
  if (st.type === 'missile' && this.has('W2')) r *= 1.15;
  for (var i = 0; i < radars.length; i++) if (radars[i] !== st && Math.hypot(radars[i].x - st.x, radars[i].y - st.y) < 60) { r *= 1.15; break; }
  return r;
};
P.towerStep = function (st, dt, radars) {
  var d = T[st.type], s = this.stats_(st); st.beam = null;
  if (d.cls === 'def' && st.type === 'radar') return;
  var rng = this.rangeOf(st, s, radars); st.rng = rng;
  if (st.dis > 0) return;
  var rate = (this.has('W6') ? 1.22 : 1) * this.pf, mul = this.dmgMul(st, st), self = this, a, i;
  switch (st.type) {
    case 'rail':
      st.cd -= dt * rate; if (st.cd > 0) return;
      a = this.pickTarget(st, rng); if (!a) { st.cd = 0; return; }
      st.cd += 1 / s.rate; this.hit(a, s.dmg * mul, 'kin', !!s.pierce, st.site);
      this.emit({ k: 'rail', x0: st.x, y0: st.y, x1: a.x, y1: a.y, heavy: !!s.pierce, site: st.site }); return;
    case 'missile':
      st.cd -= dt * rate; if (st.cd > 0) return;
      var n = s.n || 1, ex = [], fired = 0;
      for (i = 0; i < n; i++) { a = this.pickTarget(st, rng, n > 1 ? ex : null) || (ex.length ? this.pickTarget(st, rng) : null); if (!a) break; ex.push(a.id); fired++;
        this.projs.push({ x: st.x, y: st.y, tid: a.id, tx: a.x, ty: a.y, spd: 150, dmg: s.dmg * mul, spl: s.spl * (this.has('W5') ? 1.25 : 1), cls: 'exp', vx: 0, vy: 0, age: 0, nova: !!st.br && st.br === 'B' }); }
      if (!fired) { st.cd = 0; return; }
      st.cd += 1 / s.rate; this.emit({ k: 'missile', x: st.x, y: st.y, n: fired, site: st.site }); return;
    case 'laser':
      a = this.pickTarget(st, rng); if (!a) { st.rampT = -1; st.ramp = 1; return; }
      if (s.ramp) { if (st.rampT === a.id) st.ramp = Math.min(s.ramp, st.ramp + dt * 0.7); else { st.ramp = 1; st.rampT = a.id; } }
      var dps = s.dps * mul * rate * (s.ramp ? st.ramp : 1);
      st.beam = [a.id]; this.hit(a, dps * dt, 'las', false, st.site);
      if (s.chain) { var ex2 = [a.id], prev = a; for (i = 1; i < s.chain; i++) { var nb = this.nearestTo(prev, 32, ex2); if (!nb) break; ex2.push(nb.id); st.beam.push(nb.id); this.hit(nb, dps * 0.5 * dt, 'las', false, st.site); prev = nb; } }
      return;
    case 'lance':
      a = this.pickTarget(st, rng); if (!a) return;
      var sf = sunFactor(st.x, st.y), dl = s.dps * sf * mul * rate * dt; st.beam = [a.id]; st.sf = sf;
      if (s.pierce) { var dx = a.x - st.x, dy = a.y - st.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        for (i = 0; i < this.aliens.length; i++) { var b = this.aliens[i]; if (!b.alive || !this.visibleTo(b, st, rng)) continue; var px = b.x - st.x, py = b.y - st.y, along = px * ux + py * uy; if (along < 0 || along > rng) continue; if (Math.abs(px * uy - py * ux) < 5 + A[b.type].r) this.hit(b, dl, 'sol', false, st.site); } }
      else this.hit(a, dl, 'sol', false, st.site);
      if (s.burn) a.burn = Math.max(a.burn, 3);
      return;
    case 'grav':
      for (i = 0; i < this.aliens.length; i++) { a = this.aliens[i]; if (!a.alive) continue; var gx = st.x - a.x, gy = st.y - a.y, gd = Math.hypot(gx, gy); if (gd > rng) continue;
        var bossK = A[a.type].boss ? 0.4 : 1; a.slow = Math.max(a.slow, s.slow * bossK); this.hit(a, s.dps * mul * rate * dt, 'grav', false, st.site);
        if (s.pull && gd > 3 && !A[a.type].boss) { a.x += gx / gd * s.pull * dt; a.y += gy / gd * s.pull * dt; } }
      return;
    case 'emp':
      st.cd -= dt * rate; if (st.cd > 0) return;
      var any = false; for (i = 0; i < this.aliens.length; i++) { a = this.aliens[i]; if (a.alive && Math.hypot(a.x - st.x, a.y - st.y) < rng) { any = true; break; } }
      if (!any) { st.cd = 0; return; }
      st.cd += 1 / s.rate;
      for (i = 0; i < this.aliens.length; i++) { a = this.aliens[i]; if (!a.alive || Math.hypot(a.x - st.x, a.y - st.y) > rng) continue;
        var big = A[a.type].cost >= 12; if (!big) a.stun = Math.max(a.stun, s.stun); else a.stun = Math.max(a.stun, s.stun * 0.25);
        if (s.confuse && !A[a.type].boss) a.confuse = Math.max(a.confuse, s.confuse * (big ? 0.4 : 1));
        a.rev = true; this.hit(a, s.dmg * mul, 'emp', false, st.site); }
      this.emit({ k: 'emp', x: st.x, y: st.y, r: rng, site: st.site }); return;
    case 'aegis':
      if (s.reflect) for (i = 0; i < this.aliens.length; i++) { a = this.aliens[i]; if (a.alive && Math.hypot(a.x - st.x, a.y - st.y) < rng) this.hit(a, s.reflect * dt, 'las', false, st.site); }
      return;
    case 'carrier':
      if (!st.drones) { st.drones = []; }
      while (st.drones.length < s.n) st.drones.push({ x: st.x, y: st.y, cd: Math.random ? 0.2 * st.drones.length : 0, ang: st.drones.length * 2 });
      if (st.drones.length > s.n) st.drones.length = s.n;
      var cls = s.cls || 'kin', dmul = (cls === 'kin' && this.has('W3')) ? 1.25 : (cls === 'exp' && this.has('W5')) ? 1.35 : 1;
      for (i = 0; i < st.drones.length; i++) {
        var dr = st.drones[i]; dr.ang += dt * 1.6;
        var tg = dr.tid && this.byId(dr.tid);
        if (!tg || !tg.alive || Math.hypot(tg.x - st.x, tg.y - st.y) > rng * 1.1) { tg = this.pickTarget({ x: dr.x, y: dr.y, prio: st.prio }, rng * 0.9); if (tg && Math.hypot(tg.x - st.x, tg.y - st.y) > rng) tg = null; dr.tid = tg ? tg.id : 0; }
        var tx = tg ? tg.x + Math.cos(dr.ang) * 8 : st.x + Math.cos(dr.ang) * 10, ty = tg ? tg.y + Math.sin(dr.ang) * 8 : st.y + Math.sin(dr.ang) * 10;
        var mx = tx - dr.x, my = ty - dr.y, md = Math.hypot(mx, my) || 1, sp = Math.min(md, 95 * dt);
        dr.x += mx / md * sp; dr.y += my / md * sp; dr.cd -= dt * rate;
        if (tg && dr.cd <= 0 && Math.hypot(tg.x - dr.x, tg.y - dr.y) < 16) { dr.cd = 1 / s.rate; this.hit(tg, s.dmg * mul * dmul / (this.has('W3') && cls === 'kin' ? 1 : 1), cls, false, st.site); this.emit({ k: 'dshot', x0: dr.x, y0: dr.y, x1: tg.x, y1: tg.y, heavy: cls === 'exp' }); }
      }
      return;
  }
};
P.gridStep = function (dt) {
  var e = this.bp.earth, s4 = this.has('S4'), rng = 46 * (s4 ? 1.4 : 1);
  this.gridCd -= dt * this.pf; if (this.gridCd > 0) return;
  var a = this.pickTarget({ x: e.x, y: e.y, prio: 'near' }, rng); if (!a) { this.gridCd = 0; return; }
  this.gridCd = 1 / 1.25; this.hit(a, 8 * (s4 ? 3 : 1), 'kin', false, 'grid');
  this.emit({ k: 'grid', x0: e.x, y0: e.y, x1: a.x, y1: a.y });
};
P.byId = function (id) { for (var i = 0; i < this.aliens.length; i++) if (this.aliens[i].id === id) return this.aliens[i]; return null; };
P.nearestTo = function (p, r, excl) { var best = null, bd = r * r; for (var i = 0; i < this.aliens.length; i++) { var a = this.aliens[i]; if (!a.alive || excl.indexOf(a.id) >= 0 || !a.rev) continue; var d2 = (a.x - p.x) * (a.x - p.x) + (a.y - p.y) * (a.y - p.y); if (d2 < bd) { bd = d2; best = a; } } return best; };
P.projStep = function (dt) {
  var keep = [];
  for (var i = 0; i < this.projs.length; i++) {
    var p = this.projs[i], t = this.byId(p.tid); p.age += dt;
    if (t && t.alive) { p.tx = t.x; p.ty = t.y; }
    var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), sp = p.spd * dt * (1 + p.age);
    if (d <= sp + 2) {
      for (var j = 0; j < this.aliens.length; j++) { var a = this.aliens[j]; if (!a.alive) continue; var dd = Math.hypot(a.x - p.tx, a.y - p.ty); if (dd < p.spl + A[a.type].r) this.hit(a, p.dmg * (dd < p.spl * 0.4 ? 1 : 0.65), p.cls, false, 'msl'); }
      this.emit({ k: 'boom', x: p.tx, y: p.ty, r: p.spl, nova: p.nova });
    } else { p.vx = dx / d; p.vy = dy / d; p.x += p.vx * sp; p.y += p.vy * sp; keep.push(p); }
  }
  this.projs = keep;
};
P.alienStep = function (a, dt, outposts, aegis) {
  var ad = A[a.type], e = this.bp.earth, i;
  // status effects
  if (a.burn > 0) { a.burn -= dt; this.hit(a, 30 * dt * (this.cur ? Math.sqrt(this.cur.hpMul) : 1), 'sol', false, 'burn'); if (!a.alive) return; }
  if (ad.sh && a.sh < a.shMax && this.t - a.lastHit > 2) a.sh = Math.min(a.shMax, a.sh + ad.shr * (this.cur ? this.cur.hpMul : 1) * (this.has('B4') ? 0.5 : 1) * dt);
  if (ad.heal) { var hr = ad.heal * (this.cur ? this.cur.hpMul : 1) * (this.has('B4') ? 0.4 : 1) * dt;
    for (i = 0; i < this.aliens.length; i++) { var b = this.aliens[i]; if (b.alive && b !== a && b.hp < b.hpMax && Math.abs(b.x - a.x) < 42 && Math.abs(b.y - a.y) < 42 && Math.hypot(b.x - a.x, b.y - a.y) < 42) { b.hp = Math.min(b.hpMax, b.hp + hr * (A[b.type].boss ? 0.3 : 1)); a.healing = 0.3; } } }
  if (ad.spawn) { a.spawnT -= dt; if (a.spawnT <= 0) { a.spawnT = ad.spawnT * (a.phase >= 2 ? 0.6 : 1); var cnt = ad.spawn === 'drone' ? 2 : 1; for (i = 0; i < cnt; i++) { var c = this.spawn(ad.spawn, a.vec, a.x + (i - 0.5) * 8, a.y + 4); c.curl = a.curl * 0.6; } this.emit({ k: 'launch', x: a.x, y: a.y }); } }
  if (ad.mono) {
    a.cyc += dt; var per = 10.5; a.open = (a.cyc % per) > 7; if (a.open !== a.wasOpen) { a.wasOpen = a.open; this.emit({ k: a.open ? 'monoOpen' : 'monoClose', x: a.x, y: a.y }); }
    a.pulse -= dt; if (a.pulse <= 0) { a.pulse = ad.elder && a.phase >= 1 ? 7 : 10; this.emit({ k: 'monoPulse', x: a.x, y: a.y, r: 115 });
      if (!this.has('S5')) for (var sid in this.structs) { var st = this.structs[sid]; if (T[st.type].cls !== 'eco' && Math.hypot(st.x - a.x, st.y - a.y) < 115) st.dis = 4; } }
    if (ad.elder) { var f = a.hp / a.hpMax; var ph = f < 0.33 ? 2 : f < 0.66 ? 1 : 0; if (ph > a.phase) { a.phase = ph; this.emit({ k: 'phase', p: ph }); for (i = 0; i < 6; i++) { var cc = this.spawn(ph === 2 ? 'prism' : 'phantom', a.vec, a.x + Math.cos(i) * 20, a.y + Math.sin(i) * 20); cc.curl = a.curl; } } }
  }
  if (a.frozen > 0) { a.frozen -= dt; return; }
  if (a.stun > 0) { a.stun -= dt; return; }
  // target
  var tx = e.x, ty = e.y, targetSt = null;
  if (ad.raid) {
    if (a.tgt) { targetSt = this.structs[a.tgt]; if (!targetSt) a.tgt = null; }
    if (!a.tgt && outposts.length) { var bd = 1e9; for (i = 0; i < outposts.length; i++) { var o = outposts[i], od = Math.hypot(o.x - a.x, o.y - a.y); if (o.hp > 0 && od < bd) { bd = od; targetSt = o; } } a.tgt = targetSt ? targetSt.site : null; }
    if (targetSt) { tx = targetSt.x; ty = targetSt.y; }
  }
  var dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy) || 1;
  // siege ships hold position and shell Earth
  if (ad.siege && !targetSt && d < ad.siege) {
    a.sieging = true; a.fire = (a.fire || 1.2) - dt;
    if (a.fire <= 0) { a.fire = 2.6; this.damageEarth(ad.dmg * 0.22, 'shell'); this.emit({ k: 'shell', x0: a.x, y0: a.y, x1: e.x, y1: e.y }); }
    return;
  }
  var f = clamp((d - 40) / 330, 0, 1), ang = a.curl * f, c = Math.cos(ang), s = Math.sin(ang);
  var ux = (dx * c - dy * s) / d, uy = (dx * s + dy * c) / d;
  var rr = Math.hypot(a.x, a.y); if (rr < 48) { var push = (48 - rr) / 48 * 2; ux += a.x / rr * push; uy += a.y / rr * push; var ul = Math.hypot(ux, uy); ux /= ul; uy /= ul; }
  var spd = a.spd * (1 - a.slow) * (ad.elder && a.phase >= 2 ? 1.4 : 1);
  if (a.confuse > 0) { a.confuse -= dt; ux = -ux; uy = -uy; spd *= 0.6; }
  a.x += ux * spd * dt; a.y += uy * spd * dt; a.hx = ux; a.hy = uy;
  // arrival
  if (targetSt) {
    if (Math.hypot(targetSt.x - a.x, targetSt.y - a.y) < 5) {
      var prot = 1; for (i = 0; i < aegis.length; i++) { var as = this.stats_(aegis[i]); if (Math.hypot(aegis[i].x - targetSt.x, aegis[i].y - targetSt.y) < as.rng) { prot = 0.35; break; } }
      targetSt.hp -= 45 * prot * (this.cur ? Math.sqrt(this.cur.hpMul) : 1); this.metals = Math.max(0, this.metals - 12);
      a.alive = false; this.stats.leaked++; this.emit({ k: 'raid', site: targetSt.site, x: a.x, y: a.y });
    }
  } else if (Math.hypot(e.x - a.x, e.y - a.y) < D.BODY.earth.size + ad.r) {
    a.alive = false; this.stats.leaked++; this.damageEarth(ad.dmg, a.type); this.emit({ k: 'impact', x: a.x, y: a.y, type: a.type });
  }
};

/* ---------- save / resume (only between waves) ---------- */
P.serialize = function () {
  var ss = {}; for (var k in this.structs) { var st = this.structs[k]; ss[k] = { type: st.type, lv: st.lv, br: st.br, hp: st.hp, hpMax: st.hpMax, prio: st.prio, inv: st.inv }; }
  return { v: 1, sector: this.sectorIdx < 0 ? 'endless' : this.sectorIdx, diff: this.diffId, perks: this.perks, t: this.t, w: this.w, metals: this.metals, science: this.science,
    earthHp: this.earthHp, earthMax: this.earthMax, research: this.research, kills: this.kills, structs: ss, superCharge: this.superCharge, score: this.score, stats: this.stats };
};
Sim.load = function (o, fx) {
  var s = new Sim({ sector: o.sector, diff: o.diff, perks: o.perks, fx: fx });
  ['t', 'w', 'metals', 'science', 'earthHp', 'earthMax', 'research', 'kills', 'superCharge', 'score', 'stats'].forEach(function (k) { if (o[k] !== undefined) s[k] = o[k]; });
  for (var k in o.structs) { var q = o.structs[k]; s.structs[k] = { site: k, type: q.type, lv: q.lv, br: q.br, hp: q.hp, hpMax: q.hpMax, cd: 0.3, prio: q.prio || 'first', dis: 0, inv: q.inv, ramp: 1, rampT: -1, beam: null, drones: null }; }
  s.computeBodies(); s.energy(); s.preview = s.genWave(s.w + 1); return s;
};
Sim.sunFactor = sunFactor;
Sim.D = D;
if (typeof module !== 'undefined' && module.exports) module.exports = Sim; else root.HPSim = Sim;
})(this);
