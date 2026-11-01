// Technology-tree logic tests (node): prerequisites, mutual exclusivity, layout and navigation. Usage: node tests/tree.test.js
var assert = require('assert');
var Sim = require('../js/sim.js'), D = Sim.D, Tree = require('../js/tree.js');
var n = 0; function ok(c, m) { assert.ok(c, m); n++; }
function fresh(sector) { var s = new Sim({ sector: sector === undefined ? 9 : sector, diff: 'commander', perks: {} }); s.science = 5000; return s; }

// --- prerequisites gate research
var s = fresh();
D.RESEARCH.forEach(function (r) {
  if (!r.req || s.sector.res.indexOf(r.id) < 0) return;
  var t = fresh(); ok(t.researchState(r.id) === 'prereq', r.id + ' should need its prerequisite');
  ok(t.doResearch(r.id) === false, r.id + ' cannot be researched before its prerequisite');
  (function chain(id) { (D.RES[id].req || []).forEach(function (q) { if (!t.research[q]) { chain(q); ok(t.doResearch(q), 'prerequisite ' + q + ' researchable'); } }); })(r.id);
  ok(t.researchState(r.id) === 'ready', r.id + ' ready once prerequisites are done');
  ok(t.doResearch(r.id) === true && t.researchState(r.id) === 'done', r.id + ' researched');
});
// cross-lane prerequisite: Asteroid Prospecting needs Ion Drives
s = fresh(); ok(s.researchState('E2') === 'prereq'); s.doResearch('P1'); ok(s.researchState('E2') === 'ready');
// science is spent and insufficient science blocks
s = fresh(); s.science = 10; ok(s.researchState('W1') === 'poor' && !s.doResearch('W1'));
s.science = 25; ok(s.doResearch('W1') && s.science === 0);
// specimens gate xenobiology
s = fresh(); ok(s.researchState('B1') === 'specimen'); s.kills.drone = 40; ok(s.researchState('B1') === 'ready');

// --- mutual exclusivity
['D', 'X'].forEach(function (g) {
  var ids = D.RESEARCH.filter(function (r) { return r.excl === g; }).map(function (r) { return r.id; });
  ok(ids.length === 2, 'exclusive group ' + g + ' has two choices');
  ids.forEach(function (pick) {
    var t = fresh(), other = ids.filter(function (x) { return x !== pick; })[0];
    ok(t.researchState(other) === 'ready' && t.researchState(pick) === 'ready', 'both choices open at first');
    ok(t.doResearch(pick), 'choose ' + pick);
    ok(t.researchState(other) === 'excluded', other + ' locked out after choosing ' + pick);
    ok(t.doResearch(other) === false && !t.research[other], other + ' cannot also be researched');
    ok(Tree.rivals(pick).join() === other && Tree.rivals(other).join() === pick, 'rivals listed');
  });
});
ok(Tree.rivals('W1').length === 0, 'non-exclusive research has no rivals');
// survives save / load
s = fresh(); s.doResearch('X2'); var s2 = Sim.load(JSON.parse(JSON.stringify(s.serialize())), true);
ok(s2.researchState('X1') === 'excluded', 'exclusivity persists across save/load');

// --- layout
var L = Tree.layout(), ids = Object.keys(L.nodes);
ok(ids.length === D.RESEARCH.length, 'every research project is placed');
D.RESEARCH.forEach(function (r) { (r.req || []).forEach(function (q) {
  ok(L.edges.some(function (e) { return e.from === q && e.to === r.id; }), 'edge ' + q + ' -> ' + r.id);
  ok(L.nodes[r.id].x > L.nodes[q].x + L.nodes[q].w, r.id + ' sits right of its prerequisite ' + q); }); });
ok(L.edges.length === D.RESEARCH.reduce(function (a, r) { return a + (r.req || []).length; }, 0), 'no stray edges');
ok(L.excl.length === 2 && L.excl.every(function (e) { return D.RES[e.a].excl === D.RES[e.b].excl; }), 'exclusive pairs linked');
for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) { var a = L.nodes[ids[i]], b = L.nodes[ids[j]];
  ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, 'nodes ' + a.id + ' and ' + b.id + ' do not overlap'); }
ids.forEach(function (id) { var nd = L.nodes[id]; ok(nd.x >= 0 && nd.y >= 0 && nd.x + nd.w <= L.W && nd.y + nd.h <= L.H, id + ' inside the plane');
  ok(L.nodes[id].cat === D.RES[id].cat, id + ' in its own category lane'); });

// --- navigation reaches every node from W1 using only direction moves
var seen = { W1: 1 }, q = ['W1'];
while (q.length) { var c = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var t = Tree.nav(L, c, d[0], d[1]); if (!seen[t]) { seen[t] = 1; q.push(t); } }); }
ok(Object.keys(seen).length === ids.length, 'arrow / d-pad navigation reaches all ' + ids.length + ' nodes (reached ' + Object.keys(seen).length + ')');
ok(Tree.nav(L, 'W1', 1, 0) === 'W4' && Tree.nav(L, 'P1', 1, 0) === 'P3' && Tree.nav(L, 'D1', 1, 0) === 'D2', 'right follows the arrows');

console.log('TREE OK · ' + n + ' assertions');
