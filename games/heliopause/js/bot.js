/* HELIOPAUSE — autopilot strategies. Used by the headless balance harness and the title-screen attract demo. */
(function (root) {
'use strict';
var Sim = (typeof module !== 'undefined' && module.exports) ? require('./sim.js') : root.HPSim;
var D = Sim.D, T = D.TOWERS, A = D.ALIENS;

var MINES = ['ce1', 'jt4', 'jt5', 'vs1', 'pa1', 'ma1', 'ma2', 'lu1', 'lu2', 'hy1', 'io1', 'me1'];
var SOLAR = ['me1', 've1', 've2', 'eo3', 'eo4', 'el4', 'el5', 'lu2'];
function counts(s) { var c = {}; for (var k in s.structs) c[s.structs[k].type] = (c[s.structs[k].type] || 0) + 1; return c; }
function threat(s) { var t = {}; s.preview.groups.forEach(function (g) { t[g.type] = (t[g.type] || 0) + g.n * A[g.type].cost; }); return t; }
function freeSites(s, kind) { return D.SITES.filter(function (x) { return !s.structs[x.id] && s.siteReachable(x.id) && x.kinds.indexOf(kind) >= 0; }).map(function (x) { return x.id; }); }
function ensurePower(s, pw) {
  var g = 0; while (s.euse + pw > s.ecap && g++ < 4) {
    var opts = freeSites(s, 'S').sort(function (a, b) { var pa = s.sitePos(a), pb = s.sitePos(b); return Sim.sunFactor(pb.x, pb.y) - Sim.sunFactor(pa.x, pa.y); });
    if (opts.length && s.build(opts[0], 'solar')) continue;
    var sol = null; for (var k in s.structs) if (s.structs[k].type === 'solar' && s.upgradeInfo(k)) sol = k;
    if (sol && s.upgrade(sol)) continue;
    return false;
  }
  return s.euse + pw <= s.ecap;
}
function bestSite(s, type, paths) {
  var sites = freeSites(s, 'T'); if (!sites.length) return null;
  var rng = T[type].lv[0].rng || 60, best = null, bv = -1;
  sites.forEach(function (id) { var v = s.coverage(id, rng, paths); if (type === 'lance') { var p = s.sitePos(id); v *= Sim.sunFactor(p.x, p.y); } if (v > bv) { bv = v; best = id; } });
  return best;
}
/* What to build against the coming wave (and the sector's pool in general). */
function wantTower(s, c, th) {
  var tot = 0; for (var k in th) tot += th[k]; var f = function (k) { return (th[k] || 0) / (tot || 1); };
  var sw = f('drone') + f('hydra') + f('carrier') * 0.6, arm = f('dread') + f('prism') + f('leviathan'), shd = f('aegis') + f('mender') * 0.5;
  var nT = (c.rail || 0) + (c.missile || 0) + (c.laser || 0) + (c.lance || 0) + (c.carrier || 0) + (c.emp || 0);
  if (th.phantom && !c.radar && s.towerUnlocked('radar')) return 'radar';
  if (shd > 0.25 && s.towerUnlocked('emp') && !c.emp) return 'emp';
  if (nT >= 3 && s.towerUnlocked('grav') && (c.grav || 0) < 1 + (nT / 8 | 0)) return 'grav';
  if (nT >= 4 && s.towerUnlocked('aegis') && !c.aegis) return 'aegis';
  if (nT >= 5 && s.towerUnlocked('lance') && (c.lance || 0) < 2 && freeSites(s, 'T').some(function (id) { var p = s.sitePos(id); return Sim.sunFactor(p.x, p.y) > 1.5; })) return 'lance';
  if (nT >= 6 && s.towerUnlocked('carrier') && !c.carrier) return 'carrier';
  var wM = sw + 0.25 - (c.missile || 0) / (nT + 1), wR = arm + 0.35 - (c.rail || 0) / (nT + 1), wL = s.towerUnlocked('laser') ? shd + 0.2 - f('prism') - (c.laser || 0) / (nT + 1) : -9;
  return wM >= wR && wM >= wL ? 'missile' : wR >= wL ? 'rail' : 'laser';
}
function branchFor(s, st, th) {
  switch (st.type) {
    case 'rail': return (th.dread || 0) + (th.leviathan || 0) + (th.monolith || 0) > 15 ? 'A' : 'B';
    case 'missile': return (th.drone || 0) > 20 ? 'A' : 'B';
    case 'laser': return 'B'; case 'grav': return 'A'; case 'emp': return 'A'; case 'lance': return 'A'; case 'aegis': return 'A'; case 'carrier': return 'A';
  }
  return 'A';
}
var RPRIO = ['S4', 'E1', 'W2', 'W3', 'P1', 'P2', 'S3', 'W1', 'S2', 'D1', 'B1', 'B2', 'S1', 'B3', 'B4', 'W4', 'E3', 'E2', 'X1', 'W5', 'E4', 'P6', 'S5', 'P4', 'B5', 'W6', 'P3', 'E5', 'P5'];

var BOTS = {
  smart: function (s, opt) {
    opt = opt || {};
    var sec = s.sector, poolHas = function (t) { return sec.pool.indexOf(t) >= 0; };
    if (freeSites(s, 'T').length < 3) ['P1', 'P3', 'P5'].forEach(function (id) { if (s.researchState(id) === 'ready') s.doResearch(id); });
    if (!opt.noResearch) RPRIO.forEach(function (id) {
      if ((id === 'S3' || id === 'B3') && !poolHas('phantom')) return;
      if ((id === 'S2' || id === 'W1' || id === 'B4') && !poolHas('aegis') && !poolHas('mender') && id !== 'W1') return;
      if (s.researchState(id) === 'ready') s.doResearch(id);
    });
    ensurePower(s, 0);
    var c = counts(s), th = threat(s), late = !sec.endless && s.w >= sec.waves - 3, paths = s.ghostPaths(), guard = 0;
    var nT = function () { var c2 = counts(s), n = 0; for (var k in c2) if (T[k].cls !== 'eco') n += c2[k]; return n; };
    // economy: mines in the opening, a lab once established
    if (!opt.noEco && !late) {
      var want = Math.min(opt.greedy ? 6 : 4, (opt.greedy ? 2 : 0) + Math.floor(s.w / 2));
      if (nT() >= 2) while ((counts(s).mine || 0) < want) { var ms = MINES.filter(function (id) { return !s.structs[id] && s.siteReachable(id); })[0]; if (!ms || !ensurePower(s, 1) || !s.build(ms, 'mine')) break; }
      if (s.w >= 3 && !counts(s).lab && s.metals > 200) { var ls = ['eu1', 'en1', 'ti1', 'ma2', 'lu2'].filter(function (id) { return !s.structs[id] && s.siteReachable(id); })[0]; if (ls && ensurePower(s, 1)) s.build(ls, 'lab'); }
    }
    while (guard++ < 40) {
      c = counts(s);
      var type = wantTower(s, c, th), site = bestSite(s, type, paths);
      if (site && s.metals >= s.buildCost(type) && (nT() < 3 + s.w * 1.2 || !hasUpgrade(s))) { if (ensurePower(s, T[type].pw) && s.build(site, type)) continue; }
      // upgrade the cheapest weapon
      var best = null, bc = 1e9;
      for (var sid in s.structs) { var st = s.structs[sid]; if (T[st.type].cls === 'eco' && st.type !== 'mine') continue; if (st.type === 'mine' && late) continue; var u = s.upgradeInfo(sid); if (!u) continue; var cost = u.kind === 'lv' ? u.cost : u[branchFor(s, st, th)]; if (cost < bc) { bc = cost; best = sid; } }
      if (best && s.metals >= bc) { var u2 = s.upgradeInfo(best); if (s.upgrade(best, u2.kind === 'br' ? branchFor(s, s.structs[best], th) : undefined)) continue; }
      if (site && s.metals >= s.buildCost(type) && ensurePower(s, T[type].pw) && s.build(site, type)) continue;
      break;
    }
  },
  /* Only railguns, no research, no economy, no power management. */
  naive: function (s) {
    var g = 0, near = ['eo1', 'eo2', 'eo3', 'eo4', 'lu1', 'lu2', 'el4', 'el5', 've1', 've2', 'ma1', 'ma2'];
    while (g++ < 30) { var site = near.filter(function (id) { return !s.structs[id]; })[0]; if (site && s.build(site, 'rail')) continue;
      var done = false; for (var k in s.structs) { var u = s.upgradeInfo(k); if (u && s.upgrade(k, 'B')) { done = true; break; } } if (!done) break; }
  },
  turtle: function (s) { BOTS.smart(s, { noEco: true }); },
  greedy: function (s) { BOTS.smart(s, { greedy: true }); },
  noresearch: function (s) { BOTS.smart(s, { noResearch: true }); }
};
function hasUpgrade(s) { for (var k in s.structs) if (T[s.structs[k].type].cls !== 'eco' && s.upgradeInfo(k)) return true; return false; }

function play(o) {
  var s = new Sim({ sector: o.sector, diff: o.diff, fx: false, perks: o.perks });
  var bot = BOTS[o.bot || 'smart'], maxW = o.maxWaves || 1e9, dt = 1 / 20;
  while (s.mode !== 'won' && s.mode !== 'lost' && s.w < maxW) {
    bot(s);
    s.startWave();
    var n = 0;
    while (s.mode === 'wave' && n++ < 20 * 900) {
      s.step(dt);
      if (o.useSuper !== false && s.superCharge >= 100 && s.aliens.some(function (a) { return a.de < 150; }) && (s.aliens.length > 8 || s.aliens.some(function (a) { return A[a.type].boss; }))) s.fireSuper();
    }
    if (o.log) o.log(s);
  }
  return { mode: s.mode, w: s.w, earth: Math.round(s.earthHp), earthMax: s.earthMax, stars: s.stars(), score: s.score, sim: s };
}
var api = { BOTS: BOTS, play: play };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HPBot = api;
})(this);
