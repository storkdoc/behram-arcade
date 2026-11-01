/* HELIOPAUSE — technology tree layout and navigation. Pure functions, no DOM: used by the research screen and by node tests. */
(function (root) {
'use strict';
var D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.HPD;
// Each lane is a category. Placement is [column (tier), row within the lane]; a node always sits right of everything it requires.
var HALVES = [
  [{ cat: 'W', place: { W1: [0, 0], W4: [1, 0], W2: [0, 1], W5: [1, 1], W3: [0, 2], W6: [1, 2] } },
   { cat: 'P', place: { P1: [0, 0], P3: [1, 0], P5: [2, 0], P2: [0, 1], P4: [1, 1], P6: [1, 2] } },
   { cat: 'E', place: { E1: [0, 0], E4: [1, 0], E3: [0, 1], E5: [1, 1], E2: [1, 2] } }],
  [{ cat: 'S', place: { S2: [0, 0], S5: [1, 0], S1: [0, 1], S3: [1, 1], S4: [2, 1] } },
   { cat: 'D', place: { D1: [0, 0], D2: [2, 0] }, note: 'CHOOSE ONE' },
   { cat: 'X', place: { X1: [0, 0], X2: [2, 0] }, note: 'CHOOSE ONE' },
   { cat: 'B', place: { B1: [0, 0], B2: [1, 0], B3: [2, 0], B4: [0, 1], B5: [1, 1] }, note: 'NEEDS SPECIMENS' }]
];
var G = { nw: 150, nh: 48, gx: 36, gy: 10, head: 22, laneGap: 14, halfGap: 64, pad: 14 };

function layout() {
  var nodes = {}, lanes = [], edges = [], excl = [], W = 0, H = 0, hx = G.pad;
  HALVES.forEach(function (half) {
    var y = G.pad, halfW = 3 * G.nw + 2 * G.gx;
    half.forEach(function (lane) {
      var rows = 0, ly = y + G.head;
      Object.keys(lane.place).forEach(function (id) {
        var p = lane.place[id]; rows = Math.max(rows, p[1] + 1);
        nodes[id] = { id: id, cat: lane.cat, col: p[0], row: p[1], x: hx + p[0] * (G.nw + G.gx), y: ly + p[1] * (G.nh + G.gy), w: G.nw, h: G.nh };
      });
      var lh = G.head + rows * (G.nh + G.gy) - G.gy;
      lanes.push({ cat: lane.cat, title: D.CATS[lane.cat], note: lane.note || '', x: hx - 8, y: y - 4, w: halfW + 16, h: lh + 10 });
      y += lh + G.laneGap;
    });
    H = Math.max(H, y - G.laneGap + G.pad); hx += halfW + G.halfGap;
  });
  W = hx - G.halfGap + G.pad;
  D.RESEARCH.forEach(function (r) {
    (r.req || []).forEach(function (q) { edges.push({ from: q, to: r.id, cross: D.RES[q].cat !== r.cat }); });
  });
  var groups = {};
  D.RESEARCH.forEach(function (r) { if (r.excl) (groups[r.excl] = groups[r.excl] || []).push(r.id); });
  Object.keys(groups).forEach(function (g) { var ids = groups[g]; for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) excl.push({ a: ids[i], b: ids[j], group: g }); });
  return { nodes: nodes, lanes: lanes, edges: edges, excl: excl, W: W, H: H, G: G };
}
/* ids that cannot be researched together with id */
function rivals(id) { var r = D.RES[id]; if (!r || !r.excl) return []; return D.RESEARCH.filter(function (q) { return q.excl === r.excl && q.id !== id; }).map(function (q) { return q.id; }); }
/* research that lists id as a prerequisite */
function leadsTo(id) { return D.RESEARCH.filter(function (q) { return (q.req || []).indexOf(id) >= 0; }).map(function (q) { return q.id; }); }
/* spatial navigation: the nearest node in direction (dx, dy) from node `from` */
function nav(L, from, dx, dy) {
  var a = L.nodes[from]; if (!a) return Object.keys(L.nodes)[0];
  var ax = a.x + a.w / 2, ay = a.y + a.h / 2, best = null, bs = Infinity;
  for (var id in L.nodes) {
    if (id === from) continue; var b = L.nodes[id], vx = b.x + b.w / 2 - ax, vy = b.y + b.h / 2 - ay;
    var along = vx * dx + vy * dy; if (along <= 1) continue;
    var across = Math.abs(vx * dy - vy * dx), sc = along + across * 2.5;
    if (sc < bs) { bs = sc; best = id; }
  }
  return best || from;
}
var Tree = { layout: layout, rivals: rivals, leadsTo: leadsTo, nav: nav, HALVES: HALVES, G: G };
if (typeof module !== 'undefined' && module.exports) module.exports = Tree; else root.HPTree = Tree;
})(this);
