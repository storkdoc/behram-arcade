/* AGE OF EMBERS — CPU opponent. Uses exactly the same commands as the human player.
   Expands, ages up, counters what it sees, raids, defends and (on Hard+) builds wonders. */
(function (E) {
  'use strict';
  const U = E.U, D = E.D;
  const LV = [
    { name: 'Easy', vil: 20, gather: 0.82, think: 2, first: 840, wave: 6, grow: 2, ageVil: [13, 19, 25], prod: [1, 1, 1, 1], techs: 0.4, raid: false, towers: 0, wonder: false, dock: 0, cadence: 300 },
    { name: 'Normal', vil: 32, gather: 1.0, think: 1, first: 600, wave: 9, grow: 3, ageVil: [15, 22, 28], prod: [1, 2, 2, 2], techs: 0.8, raid: true, towers: 1, wonder: false, dock: 3, cadence: 210 },
    { name: 'Hard', vil: 44, gather: 1.06, think: 1, first: 450, wave: 12, grow: 4, ageVil: [18, 27, 34], prod: [2, 2, 3, 3], techs: 1, raid: true, towers: 2, wonder: true, dock: 5, cadence: 170 },
    { name: 'Legendary', vil: 54, gather: 1.22, think: 1, first: 400, wave: 14, grow: 5, ageVil: [19, 29, 36], prod: [2, 3, 3, 4], techs: 1, raid: true, towers: 2, wonder: true, dock: 6, cadence: 150 }
  ];
  E.AI_LEVELS = LV;
  const AI = E.AI = function (G, pid, level, o) {
    this.pid = pid; this.level = level; this.P = Object.assign({}, LV[level], o || {}); this.n = 0;
    const p = G.players[pid]; p.m.gather *= this.P.gather;
    this.nextWave = this.P.first; this.waveN = 0; this.wave = null; this.seen = { infantry: 0, spear: 0, archer: 0, cavalry: 0, siege: 0, ship: 0 };
    this.known = []; this.threat = null; this.scoutI = 0; this.lastBuild = {}; this.raid = null; this.flags = {};
  };
  AI.prototype.save = function () { const o = {}; for (const k of ['level', 'nextWave', 'waveN', 'seen', 'scoutI', 'flags']) o[k] = this[k]; o.wave = this.wave ? { ids: this.wave.ids, tx: this.wave.tx, ty: this.wave.ty, s0: this.wave.s0, t0: this.wave.t0, stage: this.wave.stage } : null; return o; };
  AI.prototype.restore = function (o) { if (!o) return; Object.assign(this, o); };
  AI.prototype.update = function (G) {
    this.n++; if (this.n % this.P.think) return;
    const p = G.players[this.pid], me = this.pid; this.G = G; this.p = p;
    const tc = this.tc = G.blds.find(b => b.owner === me && b.type === 'towncenter' && b.done) || G.blds.find(b => b.owner === me && b.done && E.D.BUILD[b.type].trains);
    this.base = tc ? { x: tc.x, y: tc.y } : (this.base || { x: p.startX || G.w / 2, y: p.startY || G.h / 2 });
    const vils = this.vils = [], army = this.army = [], boats = this.boats = [];
    for (const u of G.units) if (u.owner === me) { if (u.type === 'villager') vils.push(u); else if (u.type === 'fishboat') boats.push(u); else army.push(u); }
    this.blds = G.blds.filter(b => b.owner === me);
    this.observe(G);
    this.defend(G);
    this.economy(G);
    this.military(G);
    this.techs(G);
    this.offense(G);
    this.scout(G);
  };
  // ---------------------------------------------------------------- helpers
  AI.prototype.has = function (t, incl) { return this.blds.some(b => b.type === t && (incl || b.done)); };
  AI.prototype.cnt = function (t, incl) { let n = 0; for (const b of this.blds) if (b.type === t && (incl || b.done)) n++; return n; };
  AI.prototype.spare = function (cost, keep) { const r = this.p.res; keep = keep || {}; for (const k in cost) if (r[k] - (keep[k] || 0) < cost[k]) return false; return true; };
  AI.prototype.reserve = function () { // resources held back while saving for the next age or a wonder
    const p = this.p, G = this.G; if (p.age >= 3) return this.flags.wonder ? D.BUILD.wonder.cost : {};
    const t = D.TECH['age' + (p.age + 1)]; if (this.vils.length < this.P.ageVil[p.age] - 2) return {};
    if (!G.ageReqMet(this.pid, p.age + 1)) return {};
    return t.cost;
  };
  AI.prototype.findSpot = function (type, cx, cy, r0, r1, margin) {
    const G = this.G, d = D.BUILD[type], s = d.size; const rng = G.rng;
    const cands = [];
    for (let r = r0; r <= r1; r++) {
      for (let k = 0; k < Math.max(8, r * 6); k++) {
        const a = rng() * Math.PI * 2; const tx = Math.round(cx + Math.cos(a) * r - s / 2), ty = Math.round(cy + Math.sin(a) * r - s / 2);
        if (G.placeBlock(this.pid, type, tx, ty)) continue;
        if (margin && !this.ringFree(tx, ty, s)) continue;
        cands.push([tx, ty]); if (cands.length > 2) break;
      }
      if (cands.length) break;
    }
    return cands[0] || null;
  };
  AI.prototype.ringFree = function (tx, ty, s) {
    const G = this.G; for (let y = ty - 1; y <= ty + s; y++) for (let x = tx - 1; x <= tx + s; x++) { if (x >= tx && x < tx + s && y >= ty && y < ty + s) continue; const i = y * G.w + x; const o = G.occ[i]; if (o) { const e = G.ents.get(o); if (e && e.k === 'b' && e.type !== 'farm') return false; } if (G.terr[i] === E.Map.T.WATER) return false; }
    return true;
  };
  AI.prototype.builders = function (n, x, y) { // pick villagers for a construction job, preferring wood and idle ones
    const c = this.vils.filter(v => v.st !== 'build' && !v.flee).sort((a, b) => (a.st === 'idle' ? -50 : a.ct === 'w' ? -10 : a.lastKind === 'farm' ? 30 : 0) + U.dist(a.x, a.y, x, y) - ((b.st === 'idle' ? -50 : b.ct === 'w' ? -10 : b.lastKind === 'farm' ? 30 : 0) + U.dist(b.x, b.y, x, y)));
    return c.slice(0, n).map(v => v.id);
  };
  AI.prototype.build = function (type, x, y, r0, r1, nb, margin) {
    const G = this.G; if (G.buildBlock(this.pid, type)) return null; if (!G.canAfford(this.p, D.BUILD[type].cost)) return null;
    const sp = this.findSpot(type, x, y, r0, r1, margin === undefined ? true : margin); if (!sp) return null;
    const ids = this.builders(nb || 1, sp[0], sp[1]); if (!ids.length) return null;
    const b = G.cmdBuild(ids, type, sp[0], sp[1], { owner: this.pid, silent: true }); if (b) this.lastBuild[type] = G.time; return b;
  };
  AI.prototype.underCons = function (t) { return this.blds.some(b => b.type === t && !b.done); };
  // ---------------------------------------------------------------- perception
  AI.prototype.observe = function (G) {
    const me = this.pid; const seen = { infantry: 0, spear: 0, archer: 0, cavalry: 0, siege: 0, ship: 0 };
    for (const u of G.units) if (u.owner >= 0 && G.enemy(me, u.owner) && G.visibleTo(me, u)) { const c = D.UNITS[u.type].cls; if (seen[c] !== undefined) seen[c]++; }
    for (const k in seen) this.seen[k] = this.seen[k] * 0.97 + seen[k] * 0.3;
    // remember enemy buildings we've seen
    if (this.n % 6 === 0) { this.known = G.blds.filter(b => G.enemy(me, b.owner) && G.players[me].exp[Math.floor(b.y) * G.w + Math.floor(b.x)]); }
  };
  // ---------------------------------------------------------------- defense
  AI.prototype.defend = function (G) {
    const me = this.pid, base = this.base; let tx = 0, ty = 0, n = 0, str = 0;
    for (const u of G.units) {
      if (u.owner < 0 || !G.enemy(me, u.owner) || !G.visibleTo(me, u)) continue;
      let near = U.dist(u.x, u.y, base.x, base.y) < 16;
      if (!near) for (const b of this.blds) if (Math.abs(b.x - u.x) < 8 && Math.abs(b.y - u.y) < 8) { near = true; break; }
      if (!near) continue; if (u.type === 'villager' && u.st === 'build') { /* forward building */ }
      tx += u.x; ty += u.y; n++; str += this.value(u);
    }
    this.threat = n ? { x: tx / n, y: ty / n, n, str } : null;
    const wave = this.wave ? new Set(this.wave.ids) : null;
    if (this.threat) {
      const def = this.army.filter(u => !wave || !wave.has(u.id) || str > 6);
      const ids = def.filter(u => u.st !== 'attack').map(u => u.id);
      if (ids.length) G.cmdMove(ids, this.threat.x, this.threat.y, { owner: me, attackMove: true, formation: 'spread' });
      if (wave && str > 8 && this.wave.stage !== 'home') { // recall the attack force
        const far = this.wave.ids.filter(id => { const u = G.ents.get(id); return u && U.dist(u.x, u.y, base.x, base.y) > 20; });
        if (far.length) G.cmdMove(far, this.threat.x, this.threat.y, { owner: me, attackMove: true });
        this.wave.stage = 'home';
      }
      // villagers run to the town center if they are in danger and we are outmatched
      let mine = 0; for (const u of def) mine += this.value(u);
      if (mine < str * 0.9 && this.tc) {
        for (const v of this.vils) { if (v.flee) continue; let danger = false; G.near(v.x, v.y, 5, (e) => { if (e.owner >= 0 && G.enemy(me, e.owner) && E.Game.isMil(e.type)) danger = true; }); if (danger) { v.flee = G.time; G.cmdMove([v.id], this.tc.x + (G.rng() - 0.5) * 3, this.tc.y + (G.rng() - 0.5) * 3, { owner: me }); } }
      }
      // emergency spearmen/infantry
      this.flags.alarm = G.time;
    } else {
      for (const v of this.vils) if (v.flee && G.time - v.flee > 12) { v.flee = 0; if (v.st === 'move' || v.st === 'idle') { v.st = 'idle'; } }
    }
  };
  AI.prototype.value = function (u) { const s = this.G.ustat(u.owner, u.type); return u.type === 'villager' ? 0.3 : u.type === 'fishboat' ? 0 : (s.hp * Math.max(1, s.atk)) / 250; };
  // ---------------------------------------------------------------- economy
  AI.prototype.economy = function (G) {
    const me = this.pid, p = this.p, P = this.P, base = this.base, vils = this.vils;
    // villagers
    for (const b of this.blds) if (b.type === 'towncenter' && b.done) {
      const hold = p.age < 3 && vils.length >= P.ageVil[p.age] + 3 && !this.blds.some(x => x.queue.some(q => q.tech && D.TECH[q.tech].ageUp));
      const want = !hold && vils.length + this.queued('villager') < P.vil && b.queue.filter(q => q.unit).length < 2;
      if (want && G.canAfford(p, { f: 50 }) && !(b.queue.length && b.queue[0].tech && b.queue.length >= 2)) G.cmdTrain(b.id, 'villager', { owner: me });
      if (!b.rally) G.cmdRally(b.id, b.x + 2, b.y + 2.5, 0, { owner: me });
    }
    // houses
    const prodN = this.blds.filter(b => b.done && D.BUILD[b.type].trains).length;
    const room = p.popCap - p.pop, houseCons = this.blds.filter(b => b.type === 'house' && !b.done).length;
    if (p.popCap < G.popLimit && room <= 2 + prodN && houseCons < (p.pop > 40 ? 2 : 1)) this.build('house', base.x, base.y, 5, 13, 1, true);
    // finish abandoned construction
    if (this.n % 8 === 0) for (const b of this.blds) if (!b.done && !b.lastBuilders && b.type !== 'wonder' && (!b.abT || G.time - b.abT > 6)) { b.abT = G.time; const ids = this.builders(b.type === 'farm' ? 1 : 2, b.x, b.y); if (ids.length) G.cmdRepair(ids, b.id, { owner: me, silent: true }); }
    // drop sites & farms
    this.dropSites(G);
    // assign idle villagers
    const want = this.split(); const cnt = { f: 0, w: 0, g: 0, s: 0 };
    const idle = [];
    for (const v of vils) { if (v.flee && G.time - v.flee < 12) continue; if (v.st === 'idle' || (v.st === 'return' && !G.dropFor(me, v.ct, v.x, v.y))) idle.push(v); else if (v.st === 'gather' || v.st === 'return') cnt[v.ct || 'f']++; }
    const tot = vils.length;
    // rebalance one villager per think if badly skewed
    if (!idle.length && this.n % 8 === 0) {
      let over = null, under = null, om = 0, um = 0;
      for (const k of D.RES) { const d = cnt[k] - want[k] * tot; if (d > om) { om = d; over = k; } if (-d > um) { um = -d; under = k; } }
      if (over && under && om > 2.5 && um > 2.5) { const v = vils.find(v => v.ct === over && v.st === 'gather' && v.lastKind !== 'farm'); if (v) { idle.push(v); cnt[over]--; } }
    }
    for (const v of idle) {
      let best = 'w', bv = -1e9; for (const k of D.RES) { const d = want[k] * (tot + 1) - cnt[k]; if (d > bv) { bv = d; best = k; } }
      if (!this.assign(v, best)) { if (!this.assign(v, 'w')) this.assign(v, 'f'); }
      cnt[best]++;
    }
    // market: rebalance big surpluses
    if (this.has('market') && this.n % 10 === 0) {
      for (const k of ['f', 'w', 's']) if (p.res[k] > 1500 && p.res.g < 300) G.cmdTrade(me, k, false);
      if (p.res.g > 1200) for (const k of ['f', 'w']) if (p.res[k] < 150) G.cmdTrade(me, k, true);
    }
    // fishing on water maps
    if (P.dock && this.n % 10 === 0) this.fishing(G);
  };
  AI.prototype.queued = function (t) { let n = 0; for (const b of this.blds) for (const q of b.queue) if (q.unit === t) n++; return n; };
  AI.prototype.split = function () {
    const p = this.p, a = p.age, r = p.res; let w;
    if (a === 0) w = this.vils.length < 10 ? { f: 0.6, w: 0.4, g: 0, s: 0 } : { f: 0.52, w: 0.38, g: 0.1, s: 0 };
    else if (a === 1) w = { f: 0.45, w: 0.33, g: 0.2, s: 0.02 };
    else if (a === 2) w = { f: 0.42, w: 0.27, g: 0.26, s: 0.05 };
    else w = this.flags.wonder ? { f: 0.3, w: 0.27, g: 0.25, s: 0.18 } : { f: 0.4, w: 0.25, g: 0.3, s: 0.05 };
    if (this.P.towers && a >= 1 && this.cnt('tower', true) < this.P.towers) { w.s += 0.04; w.f -= 0.04; }
    for (const k of D.RES) if (r[k] > 1400) w[k] *= 0.3; else if (r[k] > 700) w[k] *= 0.6;
    if (r.f < 150 && (r.w > 400 || r.g > 400)) w.f *= 1.35;
    return w;
  };
  AI.prototype.assign = function (v, k) {
    const G = this.G, me = this.pid, base = this.base;
    if (k === 'f') {
      const berry = G.findNode(v, 'berry', base.x, base.y, 16);
      if (berry && (!this.flags.berryMill || this.has('mill', true))) { G.cmdGather([v.id], berry.id, { owner: me }); return true; }
      // hunting
      let carcass = null; for (const r of G.res) if (r.type === 'carcass' && r.gatherers < 5 && U.dist(r.x, r.y, base.x, base.y) < 12) { carcass = r; break; }
      if (carcass) { G.cmdGather([v.id], carcass.id, { owner: me }); return true; }
      const hunters = this.vils.filter(x => x.st === 'gather' && x.lastKind === 'carcass').length;
      if (hunters < 3) { let deer = null, bd = 12 * 12; for (const a of G.units) if (a.type === 'deer') { const d = U.d2(a.x, a.y, base.x, base.y); if (d < bd && G.players[me].exp[Math.floor(a.y) * G.w + Math.floor(a.x)]) { bd = d; deer = a; } } if (deer) { G.cmdGather([v.id], deer.id, { owner: me }); return true; } }
      // farms
      const free = this.blds.find(b => b.type === 'farm' && b.done && (!b.farmer || !G.ents.get(b.farmer) || G.ents.get(b.farmer).node !== b.id));
      if (free) { G.cmdGather([v.id], free.id, { owner: me }); return true; }
      if (!this.has('mill', true)) { this.build('mill', base.x, base.y, 4, 7, 1, true); return false; }
      if (G.canAfford(this.p, { w: 60 })) {
        const anchors = this.blds.filter(b => b.done && (b.type === 'mill' || b.type === 'towncenter'));
        for (const an of anchors) { const sp = this.farmSpot(an); if (sp) { const b = G.cmdBuild([v.id], 'farm', sp[0], sp[1], { owner: me, silent: true }); if (b) return true; } }
      }
      return false;
    }
    const type = k === 'w' ? 'tree' : k === 'g' ? 'gold' : 'stone';
    const camps = this.blds.filter(b => b.done && D.BUILD[b.type].drop && D.BUILD[b.type].drop.indexOf(k) >= 0 && b.type !== 'dock');
    let node = null, bd = 1e9;
    for (const c of camps) { const n = G.findNode(v, type, c.x, c.y, c.type === 'towncenter' ? 12 : 7); if (n) { const d = U.dist(n.x, n.y, c.x, c.y) + (this.danger(n) ? 30 : 0); if (d < bd) { bd = d; node = n; } } }
    if (!node) node = G.findNode(v, type, base.x, base.y, 30);
    if (!node) return false;
    G.cmdGather([v.id], node.id, { owner: me }); return true;
  };
  AI.prototype.danger = function (n) { const t = this.threat; return t && U.dist(t.x, t.y, n.x, n.y) < 7; };
  AI.prototype.farmSpot = function (an) {
    const G = this.G; let best = null, bd = 1e9; const R = an.type === 'towncenter' ? 9 : 7;
    for (let ty = Math.floor(an.y) - R; ty <= an.y + R; ty++) for (let tx = Math.floor(an.x) - R; tx <= an.x + R; tx++) {
      const d = U.d2(tx + 1.5, ty + 1.5, an.x, an.y); if (d >= bd) continue;
      if (G.placeBlock(this.pid, 'farm', tx, ty)) continue;
      // keep a walkway: don't let farms touch non-farm buildings on more than one side
      bd = d; best = [tx, ty];
    }
    return best;
  };
  AI.prototype.dropSites = function (G) {
    if (this.n % 4) return;
    const me = this.pid, base = this.base, p = this.p;
    const near = (type, R) => { const v = this.vils[0] || { owner: me }; return G.findNode(v, type, base.x, base.y, R); };
    // lumber camp near the closest forest edge with a cluster of trees
    const lc = this.blds.filter(b => b.type === 'lumbercamp');
    const woodV = this.vils.filter(v => v.ct === 'w').length;
    if (this.vils.length >= 6 && !this.underCons('lumbercamp') && (lc.length === 0 || (woodV > lc.length * 7 && lc.length < 4) || (woodV >= 3 && lc.every(c => !G.findNode(this.vils[0], 'tree', c.x, c.y, 5))))) {
      const t = this.cluster('tree', lc); if (t && G.canAfford(p, D.BUILD.lumbercamp.cost)) this.build('lumbercamp', t.x, t.y, 1, 4, 1, true);
    }
    const mc = this.blds.filter(b => b.type === 'miningcamp');
    const goldV = this.vils.filter(v => v.ct === 'g' || v.ct === 's').length;
    if ((p.age >= 1 || this.vils.length >= 12) && !this.underCons('miningcamp') && (mc.length === 0 || (goldV >= 3 && mc.length < 3 && mc.every(c => !G.findNode(this.vils[0], 'gold', c.x, c.y, 5))))) {
      const g = this.cluster('gold', mc) || this.cluster('stone', mc); if (g && G.canAfford(p, D.BUILD.miningcamp.cost)) this.build('miningcamp', g.x, g.y, 1, 4, 1, true);
    }
    if (!this.has('mill', true) && this.vils.length >= 7) { const b = near('berry', 14); if (b) { if (this.build('mill', b.x, b.y, 2, 4, 1, true)) this.flags.berryMill = true; } else if (this.vils.length >= 10) this.build('mill', base.x, base.y, 4, 7, 1, true); }
  };
  AI.prototype.cluster = function (type, camps) {
    const G = this.G, base = this.base; let best = null, bs = 1e9;
    for (const r of G.res) {
      if (r.type !== type) continue; const d = U.dist(r.x, r.y, base.x, base.y); if (d > 32 || d < 4) continue;
      if (!G.players[this.pid].exp[r.ty * G.w + r.tx]) continue;
      if (camps.some(c => U.dist(c.x, c.y, r.x, r.y) < 6)) continue;
      if (this.danger(r)) continue;
      let k = 0; for (const o of G.res) if (o.type === type && Math.abs(o.x - r.x) < 3 && Math.abs(o.y - r.y) < 3) k++;
      if (k < (type === 'tree' ? 6 : 3)) continue;
      const sc = d - k * 0.3; if (sc < bs) { bs = sc; best = r; }
    }
    return best;
  };
  AI.prototype.fishing = function (G) {
    const me = this.pid, base = this.base; let fish = null, bd = 22 * 22;
    for (const r of G.res) if (r.type === 'fish') { const d = U.d2(r.x, r.y, base.x, base.y); if (d < bd) { bd = d; fish = r; } }
    if (!fish) return;
    const dock = this.blds.find(b => b.type === 'dock');
    if (!dock) { if (this.vils.length >= 10 && G.canAfford(this.p, D.BUILD.dock.cost)) { const sp = this.dockSpot(fish); if (sp) { const ids = this.builders(2, sp[0], sp[1]); G.cmdBuild(ids, 'dock', sp[0], sp[1], { owner: me, silent: true }); } } return; }
    if (!dock.done) return;
    if (this.boats.length + this.queued('fishboat') < this.P.dock && G.canAfford(this.p, { w: 75 }) && dock.queue.length < 2) G.cmdTrain(dock.id, 'fishboat', { owner: me });
    for (const b of this.boats) if (b.st === 'idle') { let f = null, d2 = 1e9; for (const r of G.res) if (r.type === 'fish') { const d = U.d2(r.x, r.y, dock.x, dock.y); if (d < d2) { d2 = d; f = r; } } if (f) G.cmdGather([b.id], f.id, { owner: me }); }
    if (this.seen.ship > 1 && this.queued('galley') < 1 && !G.trainBlock(me, 'galley') && this.spare({ w: 90, g: 30 }, this.reserve())) G.cmdTrain(dock.id, 'galley', { owner: me });
  };
  AI.prototype.dockSpot = function (fish) {
    const G = this.G; let best = null, bd = 1e9; const base = this.base;
    for (let ty = Math.floor(base.y) - 20; ty < base.y + 20; ty++) for (let tx = Math.floor(base.x) - 20; tx < base.x + 20; tx++) {
      if (G.placeBlock(this.pid, 'dock', tx, ty)) continue; const d = U.dist(tx, ty, base.x, base.y) + U.dist(tx, ty, fish.x, fish.y) * 0.5; if (d < bd) { bd = d; best = [tx, ty]; }
    }
    return best;
  };
  // ---------------------------------------------------------------- military production
  AI.prototype.military = function (G) {
    const me = this.pid, p = this.p, P = this.P, base = this.base, age = p.age, vn = this.vils.length;
    const keep = this.reserve();
    const front = this.front();
    // buildings
    const wantB = [];
    if (vn >= (this.level >= 2 ? 9 : 12) || this.threat) wantB.push(['barracks', 1]);
    if (age >= 1) { wantB.push(['archery', 1], ['blacksmith', 1]); if (vn >= 18) wantB.push(['stable', 1]); }
    if (age >= 1 && vn >= 20) wantB.push(['market', this.level >= 1 ? 1 : 0]);
    if (age >= 2) { wantB.push(['siegeworks', 1], ['academy', this.level >= 1 ? 1 : 0], ['stable', 1], ['barracks', P.prod[age] > 1 ? 2 : 1], ['archery', P.prod[age]]); if (P.prod[age] >= 3) wantB.push(['stable', 2]); }
    if (age >= 3) wantB.push(['barracks', P.prod[3]], ['archery', P.prod[3]], ['stable', P.prod[3] - 1], ['siegeworks', this.level >= 2 ? 2 : 1]);
    if (age >= 1 && P.towers && (this.flags.alarm || this.level >= 3)) wantB.push(['tower', P.towers]);
    // second town center for strong AIs
    if (age >= 2 && this.level >= 2 && vn >= 30) wantB.push(['towncenter', 2]);
    if (this.n % 3 === 0) for (const [t, n] of wantB) {
      if (this.cnt(t, true) >= n) continue; if (this.underCons(t) && t !== 'house') continue;
      if (!this.spare(D.BUILD[t].cost, t === 'barracks' && !this.has('barracks', true) ? {} : keep)) continue;
      if (this.blds.filter(b => !b.done && b.type !== 'house' && b.type !== 'farm' && b.type !== 'wonder').length >= (p.res.w > 600 ? 2 : 1)) break;
      const at = t === 'tower' ? front : base; const r0 = t === 'towncenter' ? 14 : t === 'tower' ? 2 : 5;
      if (t === 'towncenter') { const g = this.cluster('gold', []) || this.cluster('tree', []); if (!g) continue; this.build(t, g.x, g.y, 3, 7, 3, true); }
      else this.build(t, at.x, at.y, r0, r0 + 9, t === 'tower' ? 2 : 2, true);
      break;
    }
    // wonder
    if (P.wonder && age === 3 && !this.flags.wonder && G.time > 1300 && this.army.length >= 12 && !this.threat) this.flags.wonder = true;
    if (this.flags.wonder && !this.has('wonder', true) && G.canAfford(p, D.BUILD.wonder.cost)) this.build('wonder', base.x, base.y, 6, 14, 8, true);
    if (this.flags.wonder) { const w = this.blds.find(b => b.type === 'wonder' && !b.done); if (w && this.n % 10 === 0) { const busy = this.vils.filter(v => v.st === 'build' && v.task === w.id).length; if (busy < 8) G.cmdRepair(this.builders(8 - busy, w.x, w.y), w.id, { owner: me, silent: true }); } }
    // units
    const comp = this.composition();
    const prodB = this.blds.filter(b => b.done && D.BUILD[b.type].trains && b.type !== 'towncenter' && b.type !== 'dock');
    const milPop = this.army.length; const cap = p.popCap - p.pop;
    const keepVilFood = this.vils.length < P.vil ? { f: 50 } : {};
    for (const b of prodB) {
      if (b.queue.length >= (this.threat ? 3 : 2) || cap <= 0) continue;
      const opts = D.BUILD[b.type].trains.filter(t => !G.trainBlock(me, t) && D.UNITS[t].from === b.type);
      if (!opts.length) continue;
      opts.sort((a, c) => (comp[c] || 0) - (comp[a] || 0));
      for (const t of opts) {
        if ((comp[t] || 0) <= 0.01) continue;
        if (t === 'ram' && this.army.filter(u => u.type === 'ram').length >= 4) continue;
        if (t === 'catapult' && this.army.filter(u => u.type === 'catapult').length >= 4) continue;
        const k2 = Object.assign({}, keep); for (const k in keepVilFood) k2[k] = (k2[k] || 0) + keepVilFood[k];
        if (this.spare(D.UNITS[t].cost, this.threat ? keepVilFood : k2)) { G.cmdTrain(b.id, t, { owner: me }); break; }
      }
      if (!b.rally) G.cmdRally(b.id, front.x, front.y, 0, { owner: me });
    }
    // idle soldiers gather at the front rally point
    if (this.n % 6 === 0) {
      const wave = this.wave ? new Set(this.wave.ids) : new Set(); const raid = this.raid ? new Set(this.raid.ids) : new Set();
      const ids = this.army.filter(u => u.st === 'idle' && !wave.has(u.id) && !raid.has(u.id) && u.type !== 'galley' && u.type !== 'scout' && U.dist(u.x, u.y, front.x, front.y) > 6).map(u => u.id);
      if (ids.length) G.cmdMove(ids, front.x, front.y, { owner: me });
    }
  };
  AI.prototype.front = function () {
    const G = this.G, base = this.base, en = this.enemyGuess(); if (!en) return { x: base.x + 3, y: base.y + 3 };
    const dx = en.x - base.x, dy = en.y - base.y, d = Math.hypot(dx, dy) || 1; const x = base.x + dx / d * 7, y = base.y + dy / d * 7;
    const q = G._nearestPass(G.pass, x, y, 5); return q ? { x: q[0], y: q[1] } : { x: base.x + 3, y: base.y + 3 };
  };
  AI.prototype.enemyGuess = function () {
    const G = this.G, me = this.pid;
    if (this.known.length) { let best = null, bd = 1e9; for (const b of this.known) { const d = U.d2(b.x, b.y, this.base.x, this.base.y) + (b.type === 'towncenter' ? -100 : 0); if (d < bd) { bd = d; best = b; } } if (best) return { x: best.x, y: best.y, id: best.id }; }
    // fall back to the other players' starting positions (scouts report them after a few minutes)
    let best = null, bd = 1e9; for (const p of G.players) if (p.id !== me && p.alive && G.enemy(me, p.id) && p.startX !== undefined) { const d = U.d2(p.startX, p.startY, this.base.x, this.base.y); if (d < bd) { bd = d; best = { x: p.startX, y: p.startY }; } }
    return best;
  };
  AI.prototype.composition = function () {
    const p = this.p, a = p.age, s = this.seen; const c = {};
    if (a === 0) { c.infantry = 1; return c; }
    if (a === 1) { c.archer = 0.4; c.spear = 0.2; c.scout = 0.25; c.infantry = 0.15; }
    else { c.archer = 0.27; c.knight = 0.28; c.infantry = 0.17; c.spear = 0.1; c.ram = 0.08; c.catapult = a >= 3 ? 0.08 : 0.03; c.scout = 0.02; }
    const tot = s.infantry + s.spear + s.archer + s.cavalry + s.siege + 0.01;
    if (tot > 2) {
      c.spear = (c.spear || 0) + s.cavalry / tot * 0.9;
      c.knight = (c.knight || 0) + s.archer / tot * 0.5 + s.siege / tot * 0.4; c.scout = (c.scout || 0) + s.archer / tot * (a === 1 ? 0.6 : 0.15);
      c.archer = (c.archer || 0) + (s.infantry + s.spear) / tot * 0.6;
      c.infantry = (c.infantry || 0) + s.spear / tot * 0.4;
      if (s.archer / tot > 0.5) c.archer *= 0.6;
      if (s.cavalry / tot > 0.4) { c.knight *= 0.6; c.scout = (c.scout || 0) * 0.4; }
    }
    return c;
  };
  // ---------------------------------------------------------------- research
  AI.prototype.techs = function (G) {
    if (this.n % 4) return;
    const me = this.pid, p = this.p, keep = this.reserve(), age = p.age;
    // age up first
    if (age < 3 && this.vils.length >= this.P.ageVil[age] && G.ageReqMet(me, age + 1)) { const tc = this.tc; if (tc && !G.techBlock(me, 'age' + (age + 1)) && G.canAfford(p, D.TECH['age' + (age + 1)].cost)) { G.cmdResearch(tc.id, 'age' + (age + 1), { owner: me }); return; } }
    // make sure age requirements get built
    if (age < 3 && this.vils.length >= this.P.ageVil[age] - 3 && !G.ageReqMet(me, age + 1)) {
      const r = D.AGE_REQ[age + 1]; for (const t of r.from) { if (this.has(t, true)) continue; if (G.buildBlock(me, t) || t === 'dock') continue; if (this.underCons(t)) break; this.build(t, this.base.x, this.base.y, 5, 13, 2, true); break; }
    }
    if (G.rng() > this.P.techs) return;
    const eco = ['loom', 'wheelbarrow', 'axe1', 'farm1', 'gold1', 'handcart', 'axe2', 'farm2', 'gold2', 'farm3', 'axe3', 'stone1', 'coinage', 'gillnets'];
    const mil = ['axeman', 'forge1', 'fletch1', 'scale1', 'pad1', 'bard1', 'crossbow', 'swordsman', 'pikeman', 'forge2', 'fletch2', 'scale2', 'bard2', 'husbandry', 'thumbring', 'masonry', 'ballistics', 'arbalest', 'legionary', 'halberdier', 'paladin', 'siegeram', 'onager', 'forge3', 'pad2', 'guardtower', 'wargalley', 'guilds', 'architecture'];
    const list = this.army.length >= 6 ? (G.rng() < 0.5 ? eco.concat(mil) : mil.concat(eco)) : eco.concat(mil);
    for (const k of list) {
      const t = D.TECH[k]; if (p.techs[k] || t.age > age) continue; if (k === 'loom' && this.vils.length < 14 && !this.flags.alarm) continue;
      if (G.techBlock(me, k)) continue; const b = this.blds.find(b => b.type === t.at && b.done && b.queue.length === 0); if (!b) continue;
      if (!this.spare(t.cost, keep)) continue;
      G.cmdResearch(b.id, k, { owner: me }); return;
    }
  };
  // ---------------------------------------------------------------- offense
  AI.prototype.offense = function (G) {
    const me = this.pid, P = this.P, p = this.p;
    const homeArmy = this.army.filter(u => u.type !== 'galley' && (!this.wave || this.wave.ids.indexOf(u.id) < 0) && (!this.raid || this.raid.ids.indexOf(u.id) < 0));
    // raids: a few fast units pick off villagers
    if (P.raid && !this.raid && p.age >= 1 && G.time > P.first * 0.8 && !this.threat && this.n % 20 === 0) {
      const raiders = homeArmy.filter(u => u.type === 'scout' || u.type === 'archer').slice(0, 5);
      if (raiders.length >= 3) { const tgt = this.raidTarget(); if (tgt) { this.raid = { ids: raiders.map(u => u.id), t0: G.time, s0: this.strength(raiders) }; G.cmdMove(this.raid.ids, tgt.x, tgt.y, { owner: me, attackMove: true, formation: 'spread' }); } }
    }
    if (this.raid) {
      const alive = this.raid.ids.map(id => G.ents.get(id)).filter(u => u); this.raid.ids = alive.map(u => u.id);
      const s = this.strength(alive);
      if (!alive.length || s < this.raid.s0 * 0.45 || G.time - this.raid.t0 > 120) { if (alive.length) G.cmdMove(this.raid.ids, this.front().x, this.front().y, { owner: me }); this.raid = null; }
      else if (alive.every(u => u.st === 'idle')) { const tgt = this.raidTarget(); if (tgt) G.cmdMove(this.raid.ids, tgt.x, tgt.y, { owner: me, attackMove: true, formation: 'spread' }); else this.raid.t0 = -999; }
    }
    // main waves
    const waveSize = P.wave + this.waveN * P.grow;
    if (!this.wave && G.time >= this.nextWave && !this.threat) {
      const pick = homeArmy.filter(u => u.type !== 'fishboat');
      if (pick.length >= Math.min(waveSize, Math.max(6, (p.popCap - this.vils.length) * 0.8))) {
        const tgt = this.attackTarget(); if (tgt) {
          this.wave = { ids: pick.map(u => u.id), tx: tgt.x, ty: tgt.y, s0: this.strength(pick), t0: G.time, stage: 'go' };
          G.cmdMove(this.wave.ids, tgt.x, tgt.y, { owner: me, attackMove: true }); this.waveN++;
          G.ev('aiAttack', { owner: me, x: tgt.x, y: tgt.y, n: pick.length });
        }
      }
    }
    if (this.wave) {
      const W = this.wave; const alive = W.ids.map(id => G.ents.get(id)).filter(u => u); W.ids = alive.map(u => u.id);
      // reinforce with fresh units at home
      if (this.n % 20 === 0 && W.stage === 'go') { const fresh = homeArmy.filter(u => u.st === 'idle' && u.type !== 'scout'); if (fresh.length >= 4) { W.ids.push(...fresh.map(u => u.id)); G.cmdMove(fresh.map(u => u.id), W.tx, W.ty, { owner: me, attackMove: true }); } }
      const s = this.strength(alive);
      if (!alive.length || W.stage === 'home') { this.endWave(G, alive); return; }
      if (s < W.s0 * 0.3 && G.time - W.t0 > 20) { G.cmdMove(W.ids, this.front().x, this.front().y, { owner: me }); this.endWave(G, alive); return; }
      const idleN = alive.filter(u => u.st === 'idle').length;
      if (idleN >= alive.length * 0.6 && this.n % 4 === 0) { // target cleared: sweep on to the next one near the army
        let cx = 0, cy = 0; for (const u of alive) { cx += u.x; cy += u.y; } cx /= alive.length; cy /= alive.length;
        const tgt = this.attackTarget(cx, cy); if (tgt && G.time - W.t0 < 900) { W.tx = tgt.x; W.ty = tgt.y; G.cmdMove(W.ids, tgt.x, tgt.y, { owner: me, attackMove: true }); } else { G.cmdMove(W.ids, this.front().x, this.front().y, { owner: me }); this.endWave(G, alive); }
      }
    }
  };
  AI.prototype.endWave = function (G, alive) { this.wave = null; this.nextWave = G.time + this.P.cadence * (0.8 + G.rng() * 0.4); };
  AI.prototype.strength = function (us) { let s = 0; for (const u of us) s += this.value(u) * Math.max(0.2, u.hp / this.G.ustat(u.owner, u.type).hp); return s; };
  AI.prototype.attackTarget = function (fx, fy) {
    const G = this.G, me = this.pid;
    // an enemy wonder is always the top priority
    for (const b of G.blds) if (b.type === 'wonder' && G.enemy(me, b.owner)) return { x: b.x, y: b.y };
    const base = fx !== undefined ? { x: fx, y: fy } : this.base; let best = null, bd = 1e9;
    for (const b of this.known) { if (b.dead) continue; const d = U.dist(b.x, b.y, base.x, base.y) - (b.type === 'towncenter' ? 6 : 0) + (D.BUILD[b.type].wall ? 30 : 0); if (d < bd) { bd = d; best = b; } }
    if (best) return { x: best.x, y: best.y };
    return this.enemyGuess();
  };
  AI.prototype.raidTarget = function () {
    const G = this.G, me = this.pid; let best = null, bd = 1e9;
    for (const u of G.units) if (u.type === 'villager' && G.enemy(me, u.owner) && G.players[me].exp[Math.floor(u.y) * G.w + Math.floor(u.x)]) { let tc = 0; for (const b of G.blds) if (b.owner === u.owner && (b.type === 'towncenter' || b.type === 'tower') && U.dist(b.x, b.y, u.x, u.y) < 8) tc = 1; const d = U.dist(u.x, u.y, this.base.x, this.base.y) + tc * 40; if (d < bd) { bd = d; best = u; } }
    if (best) return { x: best.x, y: best.y };
    const g = this.enemyGuess(); return g ? { x: g.x + 6, y: g.y - 6 } : null;
  };
  // ---------------------------------------------------------------- scouting
  AI.prototype.scout = function (G) {
    const me = this.pid; const sc = this.army.find(u => u.type === 'scout' && (!this.raid || this.raid.ids.indexOf(u.id) < 0) && (!this.wave || this.wave.ids.indexOf(u.id) < 0));
    if (!sc || sc.st !== 'idle') return;
    const base = this.base; const k = this.scoutI++;
    let x, y;
    if (k < 8) { const a = k / 8 * Math.PI * 2, r = 11 + k; x = base.x + Math.cos(a) * r; y = base.y + Math.sin(a) * r; }
    else { const en = this.enemyGuess(); const a = G.rng() * Math.PI * 2, r = 6 + G.rng() * 14; const c = (k % 3 === 0 && en) ? en : { x: G.w / 2, y: G.h / 2 }; x = c.x + Math.cos(a) * r; y = c.y + Math.sin(a) * r; }
    x = U.clamp(x, 2, G.w - 2); y = U.clamp(y, 2, G.h - 2);
    G.cmdMove([sc.id], x, y, { owner: me });
  };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
