/* ==========================================================================
   MUSHROOM CLOUD — ai.js
   CPU blocs. Each has a personality (hawk / cautious / opportunist) and a
   difficulty (reaction time, intel use, salvo coordination). They only use
   what their own sensors reveal (Game.knownUnits), never the true board.
   ========================================================================== */
(function (root) {
  'use strict';
  const S = root.MCSim || require('./sim.js');
  const { Game, UNIT, BLOCS, gc, cellAt, seaPath } = S;
  const TEMPL = {
    hawk:        { silo: 5, sub: 2, radar: 2, sam: 1, airbase: 1, carrier: 1 },
    cautious:    { silo: 4, sub: 2, radar: 3, sam: 4, carrier: 1 },
    opportunist: { silo: 4, sub: 2, radar: 2, sam: 3, airbase: 1, carrier: 1 },
  };
  /* cached per-bloc cell lists and distance-to-coast */
  let CELLS = null, COAST = null;
  function cells() {
    if (CELLS) return CELLS;
    const G = (root.MCWorld || require('./world.js')).grid; CELLS = { land: [[], [], [], [], [], []], sea: [[], [], [], [], [], []], open: [] };
    COAST = new Int16Array(64800).fill(99); const q = [];
    for (let k = 0; k < 64800; k++) { const c = G[k]; if (!(c >= '0' && c <= '5') && c !== 'n') { COAST[k] = 0; q.push(k); } }
    for (let h = 0; h < q.length; h++) { const k = q[h], j = Math.floor(k / 360), i = k % 360; for (const [dj, di] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const jj = j + dj; if (jj < 0 || jj > 179) continue; const kk = jj * 360 + (i + di + 360) % 360; if (COAST[kk] > COAST[k] + 1) { COAST[kk] = COAST[k] + 1; q.push(kk); } } }
    for (let k = 0; k < 64800; k++) { const c = G[k], lat = 89.5 - Math.floor(k / 360), lon = (k % 360) - 179.5;
      if (c >= '0' && c <= '5') CELLS.land[+c].push([lat, lon, COAST[k]]);
      else if (c >= 'a' && c <= 'f') CELLS.sea[c.charCodeAt(0) - 97].push([lat, lon, 0]);
      else if (c === '.' && Math.abs(lat) < 70) CELLS.open.push([lat, lon, 0]); }
    return CELLS;
  }
  function sample(arr, n, rng) { if (arr.length <= n) return arr; const o = []; for (let i = 0; i < n; i++) o.push(arr[Math.floor(rng() * arr.length)]); return o; }
  function distToBloc(lat, lon, b, rng) { const L = cells().land[b]; let best = 1e9; const step = Math.max(1, Math.floor(L.length / 150)); for (let i = 0; i < L.length; i += step) { const d = gc(lat, lon, L[i][0], L[i][1]); if (d < best) best = d; } return best; }

  class AI {
    constructor(g, bloc, pers, diff) {
      this.g = g; this.bloc = bloc; this.pers = pers; this.diff = diff; this.next = 1 + g.rng() * 2; this.deployed = false;
      this.attacked = {}; this.retaliated = {}; this.struck = false; this.strikeAt = null; this.lastScout = -99; this.satAt = null; this.subStation = {}; this.dip = 0; this.final = false;
      this.primary = null;
    }
    get B() { return this.g.b[this.bloc]; }
    enemies() { return this.g.active.filter(o => o !== this.bloc && this.g.hostile(this.bloc, o)); }
    pickPrimary() {
      const g = this.g, B = this.B; let best = null, bs = -1e9;
      for (const o of this.enemies()) {
        const near = 100 - Math.min(100, distToBloc(...centroid(this.bloc), o, g.rng));
        const s = B.tension[o] + (this.attacked[o] ? 200 : 0) + near * 0.4 + (g.b[o].human ? 8 : 0) - (B.ceasefire[o] > g.t ? 60 : 0);
        if (s > bs) { bs = s; best = o; }
      }
      this.primary = best; return best;
    }
    static autoDeploy(g, bloc, pers) {
      const rng = g.rng, C = cells(), T = TEMPL[pers] || TEMPL.opportunist;
      const enemies = g.active.filter(o => o !== bloc);
      const L = C.land[bloc]; if (!L.length) return;
      const eDist = {}; const key = c => c[0] + ',' + c[1];
      const ed = c => { const k = key(c); if (eDist[k] === undefined) { let m = 1e9; for (const o of enemies) m = Math.min(m, distToBloc(c[0], c[1], o, rng)); eDist[k] = m; } return eDist[k]; };
      const placed = [];
      const tryPlace = (type, cands, score) => {
        const sc = cands.map(c => [c, score(c) + rng() * 4]).sort((a, b) => b[1] - a[1]);
        for (const [c] of sc.slice(0, 40)) { const jl = c[0] + (rng() - 0.5) * 0.6, jn = c[1] + (rng() - 0.5) * 0.6; let r = g.place(bloc, type, jl, jn); if (!r.ok) r = g.place(bloc, type, c[0], c[1]); if (r.ok) { placed.push([type, c[0], c[1]]); return true; } }
        return false;
      };
      const spread = (c, type, want) => { let m = 1e9; for (const p of placed) if (p[0] === type) m = Math.min(m, gc(c[0], c[1], p[1], p[2])); return m === 1e9 ? want : Math.min(m, want); };
      const cities = g.cities.filter(c => c.bloc === bloc).sort((a, b) => b.pop0 - a.pop0);
      const cand = sample(L, 260, rng);
      for (let i = 0; i < (T.radar || 0); i++) tryPlace('radar', cand, c => -ed(c) * 0.6 + spread(c, 'radar', 14) * 2.5);
      for (let i = 0; i < (T.silo || 0); i++) tryPlace('silo', cand, c => Math.min(c[2], 8) * 2 + spread(c, 'silo', 7) * 2 - (cities.some(k => gc(k.lat, k.lon, c[0], c[1]) < 2) ? 8 : 0) + Math.min(ed(c), 40) * 0.15);
      for (let i = 0; i < (T.sam || 0); i++) { const city = cities[i % Math.max(1, cities.length)]; const near = L.filter(c => gc(c[0], c[1], city.lat, city.lon) < 3.5); tryPlace('sam', near.length ? near : cand, c => -gc(c[0], c[1], city.lat, city.lon) + spread(c, 'sam', 5)); }
      for (let i = 0; i < (T.airbase || 0); i++) tryPlace('airbase', cand.filter(c => c[2] >= 1), c => -ed(c) * 0.5 + spread(c, 'airbase', 10));
      const sea = sample(C.sea[bloc], 300, rng);
      for (let i = 0; i < (T.sub || 0); i++) tryPlace('sub', sea, c => -ed(c) * 0.4 + spread(c, 'sub', 15));
      for (let i = 0; i < (T.carrier || 0); i++) tryPlace('carrier', sea, c => -ed(c) * 0.5 + spread(c, 'carrier', 10));
      // spend leftovers on interceptors
      while (g.b[bloc].budget >= UNIT.sam.cost && tryPlace('sam', cand, c => -Math.min(...cities.slice(0, 6).map(k => gc(k.lat, k.lon, c[0], c[1]))) + spread(c, 'sam', 5)));
    }
    mine(type) { return this.g.units.filter(u => u.bloc === this.bloc && u.alive && (!type || u.type === type)); }
    update(dt) {
      const g = this.g; this.next -= dt; if (this.next > 0) return; this.next = this.diff.think;
      if (!this.deployed && g.defcon >= 4) { if (g.t > 3 + (this.bloc % 3) * 2) { AI.autoDeploy(g, this.bloc, this.pers); this.deployed = true; } return; }
      this.deployed = true;
      // memory of who is shooting at us
      for (const m of g.missiles) if (m.alive && m.tb === this.bloc && g.hostile(m.bloc, this.bloc) && g.missileVisible(this.bloc, m)) { if (!this.attacked[m.bloc]) this.attacked[m.bloc] = g.t; }
      if (g.defcon <= 3) this.conventional();
      if (g.defcon <= 2) this.intel();
      if (g.defcon <= 3) this.diplomacy();
      if (g.defcon === 1) this.war();
    }
    conventional() {
      const g = this.g, e = this.primary === null ? this.pickPrimary() : this.primary; if (e === null) return;
      // submarines slip toward launch stations off the enemy coast
      for (const u of this.mine('sub')) if (!u.path && !this.subStation[u.id]) {
        const C = cells(); const pool = sample(C.sea[e].concat(C.open.filter(c => gc(c[0], c[1], ...centroid(e)) < 45)), 80, g.rng);
        pool.sort((a, b) => gc(a[0], a[1], u.lat, u.lon) - gc(b[0], b[1], u.lat, u.lon));
        for (const c of pool.slice(0, 12)) { const target = [c[0] + (g.rng() - .5), c[1] + (g.rng() - .5)]; if (this.pers === 'cautious' && distToBloc(c[0], c[1], this.bloc, g.rng) > 25) continue; const r = g.command(this.bloc, { op: 'move', id: u.id, lat: target[0], lon: target[1] }); if (r.ok) { this.subStation[u.id] = 1; break; } }
        if (!this.subStation[u.id]) this.subStation[u.id] = 1;
      }
      // carriers push forward (hawks further), and come home to cover if a sub has been spotted near us
      for (const u of this.mine('carrier')) if (!u.path && !u.sent) {
        const C = cells(); const pool = sample(C.sea[this.bloc].concat(C.open), 120, g.rng);
        const want = this.pers === 'hawk' ? 12 : this.pers === 'opportunist' ? 22 : 35;
        pool.sort((a, b) => Math.abs(distToBloc(a[0], a[1], e, g.rng) - want) - Math.abs(distToBloc(b[0], b[1], e, g.rng) - want) + (gc(a[0], a[1], u.lat, u.lon) - gc(b[0], b[1], u.lat, u.lon)) * 0.2);
        for (const c of pool.slice(0, 8)) { const r = g.command(this.bloc, { op: 'move', id: u.id, lat: c[0], lon: c[1] }); if (r.ok) break; }
        u.sent = true;
      }
      // fighter scouting sorties
      if (g.t - this.lastScout > (this.pers === 'cautious' ? 70 : 40)) {
        for (const base of this.mine().filter(u => u.fi > 0 && (u.type === 'airbase' || u.type === 'carrier'))) {
          const range = 28; const C = cells(); const L = sample(C.land[e], 60, g.rng).concat(sample(C.sea[e], 40, g.rng)).filter(c => gc(c[0], c[1], base.lat, base.lon) < range);
          if (!L.length) continue; const c = L[Math.floor(g.rng() * L.length)];
          if (g.command(this.bloc, { op: 'air', id: base.id, kind: 'fighter', lat: c[0], lon: c[1] }).ok) { this.lastScout = g.t; break; }
        }
      }
      // intercept visible hostile bombers approaching
      for (const a of g.air) if (a.kind === 'bomber' && g.hostile(a.bloc, this.bloc) && (g.canSee(this.bloc, a.lat, a.lon, false, this.B._S || []) || (a.rev[this.bloc] || 0) > g.t) && !a._chased) {
        const base = this.mine().filter(u => u.fi > 0 && gc(u.lat, u.lon, a.lat, a.lon) < 28).sort((x, y) => gc(x.lat, x.lon, a.lat, a.lon) - gc(y.lat, y.lon, a.lat, a.lon))[0];
        if (base && g.command(this.bloc, { op: 'air', id: base.id, kind: 'fighter', lat: a.lat, lon: a.lon }).ok) a._chased = true;
      }
    }
    intel() {
      const g = this.g, B = this.B, e = this.primary; if (e === null || B.sats <= 0) return;
      if (this.satAt !== null && g.t - this.satAt < (this.diff.intel >= 1 ? 40 : 70)) return;
      // look where we know least
      const known = g.knownUnits(this.bloc).filter(u => u.bloc === e);
      const L = sample(cells().land[e], 50, g.rng); let best = null, bs = -1e9;
      for (const c of L) { let s = 0; for (const u of known) if (gc(c[0], c[1], u.lat, u.lon) < 16) s -= 5; s += g.rng() * 3 * (1.2 - this.diff.intel); if (s > bs) { bs = s; best = c; } }
      if (best && g.command(this.bloc, { op: 'sat', lat: best[0], lon: best[1] }).ok) this.satAt = g.t;
    }
    diplomacy() {
      const g = this.g, B = this.B; if (g.t < this.dip) return; this.dip = g.t + 25 + g.rng() * 20;
      if (g.defcon > 2) return;
      // alliances against a common rival (3+ bloc games)
      if (g.active.length >= 3 && B.allies.length === 0) {
        const p = this.primary; const cand = g.active.filter(o => o !== this.bloc && o !== p && !B.allies.includes(o) && B.tension[o] < 50);
        if (cand.length && g.rng() < 0.5) { const o = cand[Math.floor(g.rng() * cand.length)];
          if (g.b[o].human) { if (!g.offers.some(x => x.from === this.bloc)) g.offer(this.bloc, o, 'alliance'); }
          else { const other = g.ai.find(a => a.bloc === o); if (other && other.wantsAlliance(this.bloc)) g.ally(this.bloc, o); } }
      }
      // cautious blocs reach for the hotline when things get hot
      if (this.pers !== 'hawk' && g.defcon <= 2) for (const o of this.enemies()) {
        if (B.tension[o] > 55 && !(B.ceasefire[o] > g.t) && !this.attacked[o] && g.rng() < (this.pers === 'cautious' ? 0.5 : 0.2)) {
          if (g.b[o].human) { if (!g.offers.some(x => x.from === this.bloc && x.to === o)) g.offer(this.bloc, o, 'ceasefire'); }
          else { const other = g.ai.find(a => a.bloc === o); if (other && other.wantsCeasefire(this.bloc)) g.ceasefire(this.bloc, o); }
          break;
        }
      }
    }
    wantsAlliance(from) { const B = this.B; if (this.attacked[from]) return false; if (this.pers === 'hawk' && B.tension[from] > 45) return false; return B.tension[from] < 55 && B.trust[from] > -25 && this.primary !== from; }
    wantsCeasefire(from) {
      const B = this.B, g = this.g; if (this.attacked[from] && g.t - this.attacked[from] < 60 && this.pers !== 'cautious') return false;
      if (B.trust[from] < -40) return false;
      if (this.pers === 'cautious') return B.tension[from] < 97;
      if (this.pers === 'opportunist') { const me = B.deaths / B.pop0, them = g.b[from].deaths / g.b[from].pop0; return me > them || B.tension[from] < 65; }
      return B.fear[from] > 55;
    }
    onCeasefire(o) {
      const g = this.g;
      for (const a of g.air) if (a.bloc === this.bloc && a.kind === 'bomber' && a.dest && S.landBloc(a.dest[0], a.dest[1]) === o) a.state = 'return';
      g.orders = g.orders.filter(x => !(x.bloc === this.bloc && S.landBloc(x.lat, x.lon) === o));
      if (this.pers === 'hawk' && this.B.tension[o] > 80 && g.rng() < 0.3) this.betray = { o, at: g.t + 30 + g.rng() * 60 };
    }
    stockLeft() { return this.mine().reduce((s, u) => s + (u.type === 'silo' || u.type === 'sub' ? u.wh : 0), 0); }
    war() {
      const g = this.g, B = this.B, since = g.t - g.d1At;
      if (!this.d1) { this.d1 = true; this.pickPrimary();
        const silos = this.mine('silo'); const frac = { hawk: 0.6, opportunist: 0.3, cautious: 0 }[this.pers];
        silos.slice(0, Math.round(silos.length * frac)).forEach(u => g.command(this.bloc, { op: 'mode', id: u.id, mode: 'launch' }));
        const base = { hawk: [15, 60], opportunist: [150, 320], cautious: null }[this.pers];
        if (this.forceStrikeAt !== undefined) this.strikeAt = g.t + this.forceStrikeAt;
        else if (base) this.strikeAt = g.d1At + base[0] + g.rng() * (base[1] - base[0]) + B.fear[this.primary] * (this.pers === 'hawk' ? 1.2 : 0.6);
        // hawks send bombers early (they can be recalled)
        if (this.pers === 'hawk') this.sendBombers(this.primary);
      }
      // launch on warning: retaliate against whoever is hitting us
      for (const k of Object.keys(this.attacked)) { const o = +k; if (this.retaliated[o] || g.t - this.attacked[o] < this.diff.react) continue;
        this.retaliated[o] = g.t; const n = Math.ceil(this.stockLeft() * (this.pers === 'cautious' ? 0.75 : 0.85));
        if (n > 0) { g.strikePackage(this.bloc, o, this.diff.intel >= 0.8 ? 'full' : 'countervalue', n, false); this.struck = true; }
        this.sendBombers(o); }
      // betrayal of a ceasefire (hawks only)
      if (this.betray && g.t >= this.betray.at && !this.struck) { this.strikeAt = g.t; this.primary = this.betray.o; this.betray = null; }
      // opportunist: pounce when the rival is busy elsewhere or exposed
      if (this.pers === 'opportunist' && !this.struck && this.primary !== null) { const p = this.primary;
        const busy = g.missiles.some(m => m.alive && m.bloc === p && m.tb !== this.bloc) || g.b[p].deaths > 0;
        const exposed = g.knownUnits(this.bloc).filter(u => u.bloc === p && u.type === 'silo').length >= 3;
        if ((busy || (exposed && this.diff.intel >= 0.8)) && (this.strikeAt === null || this.strikeAt > g.t + 10)) this.strikeAt = g.t + 4 + g.rng() * 8; }
      // cautious: only first-strikes if tension is unbearable and the rival is clearly about to
      if (this.pers === 'cautious' && !this.struck && this.primary !== null && B.tension[this.primary] >= 98 && since > 300 && this.strikeAt === null) this.strikeAt = g.t + 30;
      const p = this.primary;
      if (!this.struck && this.strikeAt !== null && g.t >= this.strikeAt && p !== null) {
        if (B.ceasefire[p] > g.t && !(this.pers === 'hawk' && B.tension[p] > 90)) { this.strikeAt = B.ceasefire[p] + 5; }
        else if (g.b[p].active) {
          this.struck = true; const total = this.stockLeft();
          const counter = g.knownUnits(this.bloc).filter(u => u.bloc === p && u.type === 'silo').length;
          const n = Math.ceil(total * (this.pers === 'hawk' ? 0.7 : 0.6));
          if (counter >= 2 && this.diff.intel >= 0.8) { g.strikePackage(this.bloc, p, 'counterforce', Math.min(n, counter + 2), this.diff.coord >= 0.5); g.strikePackage(this.bloc, p, 'countervalue', Math.max(0, n - counter - 2), this.diff.coord >= 0.5); }
          else g.strikePackage(this.bloc, p, this.diff.intel >= 0.8 ? 'full' : 'countervalue', n, this.diff.coord >= 0.5);
          this.sendBombers(p);
        }
      }
      // use-or-lose when the victory timer starts (only if already at war)
      if (g.finalAt !== null && !this.final && (this.struck || Object.keys(this.attacked).length)) { this.final = true; const o = this.primary; if (o !== null && g.b[o].active && !(B.ceasefire[o] > g.t)) { const n = this.stockLeft(); if (n) g.strikePackage(this.bloc, o, 'countervalue', n, false); } }
      // defence management: empty launch-mode silos go back to defending
      for (const u of this.mine('silo')) if (u.mode === 'launch' && !u.pend && u.wh === 0 && u.abm > 0 && !g.orders.some(o => o.id === u.id)) g.command(this.bloc, { op: 'mode', id: u.id, mode: 'def' });
    }
    sendBombers(o) {
      const g = this.g; if (o === null || o === undefined) return;
      const cities = g.cities.filter(c => c.bloc === o && c.pop > 0.2).sort((a, b) => b.pop - a.pop);
      let i = 0; for (const base of this.mine('airbase')) while (base.bo > 0 && cities.length) { const c = cities[i++ % cities.length]; if (!g.command(this.bloc, { op: 'air', id: base.id, kind: 'bomber', lat: c.lat, lon: c.lon }).ok) break; base.cd = 0; }
    }
  }
  const CENT = {};
  function centroid(b) { if (CENT[b]) return CENT[b]; const L = cells().land[b]; let x = 0, y = 0, z = 0; for (const c of L) { const v = S.vec(c[0], c[1]); x += v[0]; y += v[1]; z += v[2]; } const ll = S.toLL([x, y, z].map(v => v / Math.hypot(x, y, z))); return (CENT[b] = ll); }
  AI.cells = cells; AI.centroid = centroid;
  Game.AI = AI; S.AI = AI;
  if (typeof module !== 'undefined') module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
