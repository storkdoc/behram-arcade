// Jax's Adventures - the park: terrain, water, layout, props, colliders. Pure data, no rendering.
import { clamp, lerp, smooth, fbm, noise2, mulberry32, polyDist, chaikin, dist, dist2 } from './util.js';

export const HALF = 150;          // playable half-size (m)
export const GRID = 172;          // cached terrain half-size
export const LAKE = { x: -35, z: -20, sx: 1.2 };
export const ISLAND = { x: -50, z: -30, r: 8 };
export const SNOW_Y = 34;

const lakeR = th => 38 + 6 * Math.sin(2 * th + 0.7) + 4 * Math.sin(3 * th + 2.1) + 2.5 * Math.sin(5 * th + 0.3);
export function lakeSD(x, z) { const dx = (x - LAKE.x) / LAKE.sx, dz = z - LAKE.z; return lakeR(Math.atan2(dz, dx)) - Math.hypot(dx, dz); }
export function lakePoint(th, inset = 0) { const r = lakeR(th) - inset; return [LAKE.x + Math.cos(th) * r * LAKE.sx, LAKE.z + Math.sin(th) * r]; }

export const RIVERS = [
  { name: 'Cedar Creek', w: 8, pts: chaikin([[52, -215], [50, -160], [44, -122], [32, -94], [14, -66], [2, -52], [-10, -40]], 3) },
  { name: 'Otter River', w: 9, pts: chaikin([[-58, -2], [-76, 16], [-92, 44], [-89, 78], [-101, 114], [-108, 160], [-112, 215]], 3) },
];
export function riverInfo(x, z) {
  let best = null;
  for (const r of RIVERS) { const p = polyDist(r.pts, x, z); const sd = r.w / 2 - p.d; if (!best || sd > best.sd) best = { sd, r, p }; }
  return best;
}

// flatten zones {x,z,r,soft,h}
export const ZONES = [
  { id: 'hideout', x: -55, z: 72, r: 15, soft: 14, h: 2.4 },
  { id: 'camp', x: 48, z: 26, r: 30, soft: 16, h: 3.2 },
  { id: 'ranger', x: 18, z: 64, r: 13, soft: 12, h: 3.0 },
  { id: 'town', x: 118, z: 80, r: 34, soft: 18, h: 4.2 },
  { id: 'beach', x: -35, z: 30, r: 16, soft: 10, h: 1.1 },
  { id: 'dockbase', x: 27, z: -20, r: 7, soft: 8, h: 1.4 },
];

function rawBase(x, z) {
  let h = 3.2 + fbm(x * 0.011 + 5, z * 0.011 - 3, 5) * 6.5 + fbm(x * 0.05, z * 0.05, 2) * 0.6;
  h += 64 * Math.exp(-((x + 112) ** 2 + (z + 118) ** 2) / (2 * 40 * 40));           // Snowcap Peak
  h += 26 * smooth(-95, -175, z) * (0.7 + 0.3 * fbm(x * 0.02, z * 0.02, 3));         // northern ridge
  h += 14 * Math.exp(-((x - 105) ** 2 + (z + 70) ** 2) / (2 * 30 * 30));             // east knoll
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 128) h += Math.pow(e - 128, 1.45) * 0.42 * (0.75 + 0.25 * noise2(x * 0.03, z * 0.03));
  return h;
}
export function Hraw(x, z) {
  let h = rawBase(x, z);
  for (const zn of ZONES) { const d = Math.hypot(x - zn.x, z - zn.z); if (d < zn.r + zn.soft) { const w = 1 - smooth(zn.r, zn.r + zn.soft, d); h = lerp(h, zn.h + fbm(x * 0.08, z * 0.08, 2) * 0.25, w); } }
  // lake
  const sd = lakeSD(x, z);
  if (sd > -30) { const lk = sd > 0 ? -Math.min(7.2, 0.55 + sd * 0.3) * (sd < 3 ? sd / 3 : 1) - 0.0 : (-sd) * 0.24; h = Math.min(h, lk + 0.35 * (sd <= 0 ? 1 : smooth(3, 0, sd))); }
  // island
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (di < ISLAND.r * 1.8) { const ih = 1.6 * (1 - (di / ISLAND.r) ** 2) + 0.15 * noise2(x * 0.4, z * 0.4); h = Math.max(h, ih * (di < ISLAND.r ? 1 : 0) + (di >= ISLAND.r ? lerp(0.2, h, smooth(ISLAND.r, ISLAND.r * 1.8, di)) : 0)); }
  // rivers
  const ri = riverInfo(x, z);
  if (ri && ri.sd > -40) { const rd = -ri.sd; const prof = rd > 0 ? rd * 0.42 + 0.12 : -2.0 * smooth(0, 3, -rd) + 0.12 * (1 + rd / 3) ; h = Math.min(h, prof); }
  return h;
}

// --- cached height grid (1 m) ---
const GN = GRID * 2 + 1; const HG = new Float32Array(GN * GN);
for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) HG[j * GN + i] = Hraw(i - GRID, j - GRID);
export function H(x, z) {
  const fx = x + GRID, fz = z + GRID;
  if (fx < 0 || fz < 0 || fx >= GN - 1 || fz >= GN - 1) return Hraw(x, z);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * GN + i;
  return (HG[k] * (1 - u) + HG[k + 1] * u) * (1 - v) + (HG[k + GN] * (1 - u) + HG[k + GN + 1] * u) * v;
}
export function normalAt(x, z) { const e = 0.6; const nx = H(x - e, z) - H(x + e, z), nz = H(x, z - e) - H(x, z + e); const l = Math.hypot(nx, 2 * e, nz); return [nx / l, 2 * e / l, nz / l]; }
export const isWater = (x, z) => H(x, z) < -0.05;
export function waterRegion(x, z) {
  const h = H(x, z); if (h >= -0.05) return null;
  const ri = riverInfo(x, z); if (ri.sd > 0 && lakeSD(x, z) < 2) return 'river';
  return lakeSD(x, z) > 21 && Math.hypot(x - ISLAND.x, z - ISLAND.z) > 16 ? 'deep' : 'lake';
}

// --- roads & trails ---
export const ROADS = [
  chaikin([[175, 80], [130, 80], [104, 77], [84, 64], [70, 48], [60, 37]], 3),
  chaikin([[38, 38], [30, 48], [22, 57], [19, 61]], 2),
];
export const CAMP_LOOP = (() => { const p = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; p.push([48 + Math.cos(a) * 15, 26 + Math.sin(a) * 15]); } return p; })();
ROADS.push(CAMP_LOOP);
export const TRAILS = [
  chaikin([[-55, 64], [-50, 50], [-42, 38], [-36, 30]], 3),
  chaikin([[-22, 27], [-2, 22], [12, 10], [20, -6], [26, -18]], 3),
  chaikin([[28, -18], [32, -4], [33, 8], [36, 16]], 3),
  chaikin([[-44, 72], [-18, 70], [6, 66], [14, 64]], 3),
  chaikin([[-62, 68], [-74, 56], [-81, 47]], 2),
  chaikin([[-98, 43], [-112, 34], [-120, 5], [-118, -40], [-114, -78], [-112, -105]], 3),
  chaikin([[26, -24], [30, -46], [38, -72], [45, -100]], 3),
  chaikin([[31, -116], [10, -118], [-20, -118], [-55, -112], [-80, -116], [-98, -112]], 3),
  chaikin([[112, 88], [112, 80]], 1), chaikin([[134, 88], [134, 80]], 1),
];
export function roadDist(x, z) { let d = 1e9; for (const r of ROADS) d = Math.min(d, polyDist(r, x, z).d); return d; }
export function trailDist(x, z) { let d = 1e9; for (const r of TRAILS) d = Math.min(d, polyDist(r, x, z).d); return d; }

// --- bridges / decks (walkable surfaces) ---
export const DECKS = []; // {x,z,hw,hd,rot,y}
function deck(x, z, hw, hd, rot, y, kind) { DECKS.push({ x, z, hw, hd, rot, y, kind, c: Math.cos(rot), s: Math.sin(rot) }); }
export const DOCK = { x: 15, z: -20, len: 18, w: 2.6, y: 0.75, endX: 7 };
deck(15.5, -20, 9.5, 1.3, 0, 0.75, 'dock');
deck(9, -22.6, 2, 1.4, 0, 0.75, 'dock');
function bridgeOn(river, frac, len) {
  const pts = RIVERS[river].pts; const i = Math.floor(frac * (pts.length - 1)); const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
  const tx = bx - ax, tz = bz - az; const rot = Math.atan2(tz, tx) + Math.PI / 2; const x = (ax + bx) / 2, z = (az + bz) / 2;
  deck(x, z, len / 2, 1.4, rot, 1.3, 'bridge'); return { x, z, rot, len };
}
export const BRIDGES = [bridgeOn(0, 0.42, 16), bridgeOn(1, 0.36, 18)];
function inDeck(d, x, z) { const dx = x - d.x, dz = z - d.z; const lx = dx * d.c + dz * d.s, lz = -dx * d.s + dz * d.c; return Math.abs(lx) <= d.hw && Math.abs(lz) <= d.hd; }
export function deckAt(x, z) { for (const d of DECKS) if (inDeck(d, x, z)) return d; return null; }
export function ground(x, z) { const h = H(x, z); const d = deckAt(x, z); if (d) { const y = d.kind === 'bridge' ? d.y + 0.35 * Math.cos(Math.min(1, Math.abs((x - d.x) * d.c + (z - d.z) * d.s) / d.hw) * Math.PI / 2) : d.y; return Math.max(h, y); } return h; }

export function surfaceAt(x, z) {
  if (deckAt(x, z)) return 'wood';
  const h = H(x, z); if (h < -0.05) return 'water';
  if (roadDist(x, z) < 3) return 'road';
  const s = splatAt(x, z);
  if (s[3] > 0.5) return 'snow'; if (s[1] > 0.5) return 'sand'; if (s[2] > 0.5) return 'rock'; if (s[0] > 0.5) return 'dirt';
  return 'grass';
}
// splat weights [dirt, sand, rock, snow]; grass is the remainder
export function splatAt(x, z) {
  const h = H(x, z); const n = normalAt(x, z); const slope = 1 - n[1];
  let dirt = 0, sand = 0, rock = 0, snow = 0;
  const td = trailDist(x, z); dirt = Math.max(dirt, 1 - smooth(1.1, 2.1 + noise2(x * .3, z * .3) * .4, td));
  const rd = roadDist(x, z); dirt = Math.max(dirt, (1 - smooth(3, 4.2, rd)) * 0.8);
  for (const zn of ZONES) if (zn.id !== 'beach' && zn.id !== 'hideout') { const d = Math.hypot(x - zn.x, z - zn.z); dirt = Math.max(dirt, (1 - smooth(zn.r * 0.3, zn.r * 0.95, d)) * 0.45 * (0.6 + 0.4 * noise2(x * 0.15, z * 0.15))); }
  // forest floor in dense woods
  const forest = smooth(0.1, 0.45, fbm(x * 0.018 + 40, z * 0.018 - 20, 3));
  dirt = Math.max(dirt, forest * 0.35);
  sand = 1 - smooth(0.25, 1.35 + noise2(x * .2, z * .2) * .3, h);
  const bd = Math.hypot((x + 35) / 1.3, z - 27); sand = Math.max(sand, 1 - smooth(13, 17, bd + noise2(x * .2, z * .2) * 2));
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r * 0.65) sand *= 0.3;
  rock = smooth(0.32, 0.5, slope + noise2(x * .1, z * .1) * 0.08) + smooth(SNOW_Y - 16, SNOW_Y - 2, h) * 0.35;
  snow = smooth(SNOW_Y - 3, SNOW_Y + 4, h + noise2(x * .08, z * .08) * 4) * (1 - smooth(0.5, 0.75, slope));
  rock = clamp(rock, 0, 1); if (snow > 0) rock *= 1 - snow;
  if (h < -0.05) { sand = Math.max(sand, 0.5); }
  return [clamp(dirt, 0, 1), clamp(sand, 0, 1), rock, clamp(snow, 0, 1)];
}

// ===================================================== layout =====================================================
const rnd = mulberry32(20261024);
export const PROPS = [];        // visual + logical props {type, x, z, rot, ...}
export const COLS = [];         // colliders {k:'c'|'b', x,z,r | hw,hd,c,s, h(height), los}
export const HIDES = [];        // hiding spots {id, kind:'bush'|'bin'|'tent', x,z, propIdx}
export const STASHES = [];      // picnic baskets / coolers {id, kind, x,z, owner, items:[]}
export const SIGNS = [];
const prop = (type, x, z, rot = 0, o = {}) => { const p = Object.assign({ type, x, z, rot, y: ground(x, z) }, o); p.i = PROPS.length; PROPS.push(p); return p; };
const colC = (x, z, r, h = 2, los = false) => COLS.push({ k: 'c', x, z, r, h, los });
const colB = (x, z, hw, hd, rot, h = 3, los = true) => COLS.push({ k: 'b', x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), h, los });
const localTo = (o, lx, lz) => [o.x + lx * Math.cos(o.rot) - lz * Math.sin(o.rot), o.z + lx * Math.sin(o.rot) + lz * Math.cos(o.rot)];

// --- buildings ---
export const LOC = {};
function building(id, type, x, z, rot, hw, hd, h, o = {}) { const p = prop(type, x, z, rot, Object.assign({ hw, hd, h }, o)); colB(x, z, hw, hd, rot, h); COLS[COLS.length - 1].porch = 3; LOC[id] = p; return p; }
building('store', 'store', 112, 96, 0, 7, 5, 5.5, { name: 'PINECREST GENERAL STORE' });
building('trade', 'tradepost', 134, 96, 0, 5.5, 4.5, 5, { name: "WILLA'S TRADING POST" });
building('diner', 'diner', 124, 62, Math.PI, 6, 4, 4.5, { name: 'MOOSE DINER' });
building('gas', 'shed', 100, 64, Math.PI, 3, 2.5, 3.2, { name: 'BAIT & ICE' });
building('ranger', 'ranger', 14, 68, 0.3, 5, 4, 5, { name: 'RANGER STATION' });
building('hideout', 'cabin', -58, 78, 0.15, 3.4, 2.8, 4, { name: "JAX'S HIDEOUT" });
// store porch counter positions (where the NPC stands, front = -z side)
LOC.storeDoor = { x: 112, z: 89.2 }; LOC.tradeDoor = { x: 134, z: 89.6 }; LOC.hideDoor = { x: -57.2, z: 73.6 };
LOC.dockEnd = { x: 7.2, z: -20 }; LOC.dockBase = { x: 24, z: -20 }; LOC.beach = { x: -35, z: 27 }; LOC.camp = { x: 48, z: 26 };
LOC.rangerDoor = { x: 15.6, z: 63.5 }; LOC.firePit = { x: -50.5, z: 70 }; LOC.chest = { x: -61.5, z: 73.4 }; LOC.bed = { x: -54.6, z: 75 };
LOC.trailSign = { x: -48, z: 56 }; LOC.home = { x: -54.5, z: 70.5 };
prop('bigtree', -63, 70.5, 0, { name: 'treefort' }); colC(-63, 70.5, 1.0, 12, true);
prop('flagpole', 20, 58); colC(20, 58, 0.15);
prop('pumps', 106, 70, 0); colB(106, 70, 2.2, 0.6, 0, 1.8, false);
for (const [x, z] of [[96, 85], [128, 86], [146, 86], [100, 74], [140, 74], [118, 74]]) { prop('lamp', x, z); colC(x, z, 0.15, 4); }
for (const [x, z] of [[20, -14], [-28, 18], [40, 18], [56, 34], [26, 66]]) { prop('lamp', x, z); colC(x, z, 0.15, 4); }
prop('car', 120, 70, 0.05, { color: 0x2a5a9a }); colB(120, 70, 2.2, 1.0, 0.05, 1.5);
prop('car', 92, 92, Math.PI / 2, { color: 0xb33a2a }); colB(92, 92, 2.2, 1.0, Math.PI / 2, 1.5);
prop('truck', 22, 72, 0.3, { color: 0x3d5a3a }); colB(22, 72, 2.6, 1.1, 0.3, 1.9);
prop('outhouse', 66, 46, -0.5); colB(66, 46, 0.9, 0.9, -0.5, 2.5);
prop('sign', -48, 56, 0.4, { text: ['HIDEOUT', 'BEACH', 'RANGER STN'] }); colC(-48, 56, 0.2, 2);
prop('sign', 30, -10, -0.6, { text: ['DOCK', 'CAMPGROUND', 'BEACH'] }); colC(30, -10, 0.2, 2);
prop('sign', 80, 60, -0.9, { text: ['PINECREST', 'TOWN', 'CAMPGROUND'] }); colC(80, 60, 0.2, 2);
prop('sign', -110, 48, 1.4, { text: ['SNOWCAP', 'PEAK TRAIL', ''] }); colC(-110, 48, 0.2, 2);
prop('benches', -20, 30, 0.2); colB(-20, 30, 0.9, 0.35, 0.2, 0.9, false);
prop('fence', 112, 102, 0, { len: 16 });
prop('watertower', 150, 58, 0); colC(150, 58, 2.5, 12);
prop('lookout', -112, -112, 0.3); colB(-112, -112, 2, 2, 0.3, 9);

// --- hideout extras (positions for decorations) ---
export const DECOR_SPOTS = {
  firepit: { x: -50.5, z: 70, rot: 0 }, lights: { x: -58, z: 78, rot: 0.15 }, hammock: { x: -48, z: 80, rot: 0.6 },
  flag: { x: -63.5, z: 66, rot: 0 }, trophy: { x: -54.5, z: 81.2, rot: 0.15 }, telescope: { x: -46, z: 66, rot: -0.5 },
  swing: { x: -66, z: 72, rot: 0 }, gnome: { x: -52.5, z: 73, rot: 0.8 },
};
colB(DECOR_SPOTS.firepit.x, DECOR_SPOTS.firepit.z, 0, 0, 0, 0, false); // placeholder (pit collision added when built)
prop('chest', LOC.chest.x, LOC.chest.z, 0.15); colB(LOC.chest.x, LOC.chest.z, 0.5, 0.35, 0.15, 0.6, false);
prop('mailbox', -51, 62, 0.4); colC(-51, 62, 0.12);
prop('woodpile', -63, 80, 0.15); colB(-63, 80, 1.1, 0.5, 0.15, 1, false);

// --- campground ---
export const SITES = [];
const siteAngles = [150, 210, 270, 330, 30];
const siteDefs = [
  { name: 'Site 1', camp: 'tent', vehicle: 'car', tent: 0xe8742a },
  { name: 'Site 2', camp: 'rv', vehicle: null, tent: 0x2f7fd0 },
  { name: 'Site 3', camp: 'tent', vehicle: 'car', tent: 0x3fae5a },
  { name: 'Site 4', camp: 'rv', vehicle: null, tent: 0xd04a4a },
  { name: 'Site 5', camp: 'tent', vehicle: null, tent: 0xf2c230 },
];
siteAngles.forEach((deg, i) => {
  const a = deg * Math.PI / 180; const x = 48 + Math.cos(a) * 25, z = 26 + Math.sin(a) * 25; const rot = Math.atan2(Math.sin(a), Math.cos(a)); // +x local = outward
  const site = { i, x, z, rot, ...siteDefs[i] }; const L = (lx, lz) => localTo({ x, z, rot }, lx, lz);
  const [tx, tz] = L(0, 0); site.table = prop('table', tx, tz, rot + Math.PI / 2); colB(tx, tz, 1.0, 0.9, rot + Math.PI / 2, 0.8, false);
  const [cx, cz] = L(0.2, 1.9); site.cooler = prop('cooler', cx, cz, rot, { color: [0xd8352a, 0x2a6fd8, 0x2fa04a, 0xe0e0e0, 0xf08a1a][i] }); colC(cx, cz, 0.4, 0.5);
  const [fx, fz] = L(-3.6, -2.2); site.fire = prop('firering', fx, fz, 0); colC(fx, fz, 0.7, 0.4);
  if (site.camp === 'tent') { const [ex, ez] = L(5.2, -0.5); site.tent = prop('tent', ex, ez, rot + Math.PI / 2, { color: site.tent }); colB(ex, ez, 1.5, 1.3, rot + Math.PI / 2, 1.8); HIDES.push({ id: 'tent' + i, kind: 'tent', x: ex - Math.cos(rot) * 1.6, z: ez - Math.sin(rot) * 1.6, site: i, prop: site.tent.i, hx: ex, hz: ez }); }
  else { const [ex, ez] = L(6, 0.5); site.rv = prop('rv', ex, ez, rot + Math.PI / 2, { color: [0xe8e2d4, 0xf0f0f0][i % 2] }); colB(ex, ez, 4, 1.4, rot + Math.PI / 2, 3.2); }
  if (site.vehicle === 'car') { const [vx, vz] = L(3, -5.5); prop('car', vx, vz, rot, { color: [0x8c2b2b, 0x2b5f8c, 0x666a70][i % 3] }); colB(vx, vz, 2.2, 1.0, rot, 1.5); }
  const [lx, lz] = L(-1, 3.4); prop('lantern', lx, lz, 0);
  const [chx, chz] = L(-2.2, -0.8); prop('chair', chx, chz, rot + 2.4, { color: site.tent });
  STASHES.push({ id: 'basket' + i, kind: 'basket', x: tx, z: tz, site: i, items: [], prop: site.table.i });
  STASHES.push({ id: 'cooler' + i, kind: 'cooler', x: cx, z: cz, site: i, items: [], prop: site.cooler.i });
  SITES.push(site);
});
// beach picnic spots
export const BEACH_SPOTS = [{ x: -42, z: 26, rot: 0.3 }, { x: -27, z: 29, rot: -0.4 }];
BEACH_SPOTS.forEach((b, k) => {
  prop('blanket', b.x, b.z, b.rot, { color: k ? 0x2c7fd4 : 0xd93b3b }); prop('umbrella', b.x + 1.6, b.z - 1.0, 0, { color: k ? 0xffd23f : 0xff6f91 });
  STASHES.push({ id: 'beachbasket' + k, kind: 'basket', x: b.x - 0.4, z: b.z + 0.3, site: 5 + k, items: [], beach: true });
  STASHES.push({ id: 'beachcooler' + k, kind: 'cooler', x: b.x + 0.9, z: b.z + 0.6, site: 5 + k, items: [], beach: true, color: k ? 0x2a6fd8 : 0xd8352a });
  prop('basket', b.x - 0.4, b.z + 0.3, b.rot); prop('cooler', b.x + 0.9, b.z + 0.6, b.rot, { color: k ? 0x2a6fd8 : 0xd8352a });
});
prop('lifeguard', -48, 34, 0.2); colB(-48, 34, 1, 1, 0.2, 3);
prop('canoerack', 26, -26, 0); colB(26, -26, 1.6, 0.5, 0, 1.2, false);

// --- trash bins (hiding) ---
for (const [x, z] of [[40, 40], [58, 12], [62, 40], [-24, 22], [102, 88], [124, 88], [28, -24], [8, 58]]) {
  const p = prop('bin', x, z, rnd() * 6.28); colC(x, z, 0.45, 1.1); HIDES.push({ id: 'bin' + HIDES.length, kind: 'bin', x, z, prop: p.i });
}

// --- trees, bushes, rocks ---
export const TREES = [], BUSHES = [], ROCKS = [], BERRIES = [];
function clearOf(x, z, r) {
  if (Math.abs(x) > 205 || Math.abs(z) > 205) return false;
  const h = H(x, z); if (h < 0.5) return false;
  if (roadDist(x, z) < 4.5 + r || trailDist(x, z) < 2.4 + r) return false;
  for (const zn of ZONES) { const d = Math.hypot(x - zn.x, z - zn.z); if (d < zn.r * (zn.id === 'hideout' ? 0.75 : 0.95)) return false; }
  for (const c of COLS) { if (c.k === 'c') { if (dist2(x, z, c.x, c.z) < (c.r + r + 0.8) ** 2) return false; } else { const dx = x - c.x, dz = z - c.z; const lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c; if (Math.abs(lx) < c.hw + r + 1.5 && Math.abs(lz) < c.hd + r + 1.5) return false; } }
  if (deckAt(x, z) || Math.hypot(x - DOCK.x, z - DOCK.z) < 12) return false;
  return true;
}
// hand-placed hiding bushes near hot spots
const hidingBushPts = [[34, 22], [38, 6], [52, 0], [70, 22], [72, 34], [60, 50], [30, 34], [40, 52], [-30, 36], [-46, 38], [-14, 20], [10, -6], [16, -30], [104, 104], [128, 104], [96, 72], [8, 50], [30, 70], [-20, 60], [-70, 50], [62, -8], [22, 18], [78, 30], [-8, -62], [-90, 20]];
for (const [x, z] of hidingBushPts) { const s = 1.15 + rnd() * 0.25; const b = { x, z, s, hide: true, y: H(x, z), seed: rnd() }; BUSHES.push(b); HIDES.push({ id: 'bush' + HIDES.length, kind: 'bush', x, z, bush: BUSHES.length - 1 }); }
for (let tries = 0, n = 0; tries < 26000 && n < 1150; tries++) {
  const x = (rnd() * 2 - 1) * 205, z = (rnd() * 2 - 1) * 205; const inner = Math.abs(x) < HALF && Math.abs(z) < HALF;
  const dens = fbm(x * 0.018 + 40, z * 0.018 - 20, 3); const h = H(x, z);
  let p = 0.18 + smooth(-0.15, 0.35, dens) * 0.8; if (h > SNOW_Y + 4) p = 0.05; if (!inner) p = 0.75;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < 60) p *= 0.6;
  if (rnd() > p) continue;
  const r = 0.45; if (!clearOf(x, z, r + 1.2)) continue;
  let ok = true; for (const t of TREES) if (dist2(x, z, t.x, t.z) < 12) { ok = false; break; } if (!ok) continue;
  const pine = h > 14 || rnd() < 0.55 + dens * 0.3; const s = 0.8 + rnd() * 0.55 + (pine ? 0.2 : 0);
  TREES.push({ x, z, y: h, s, pine, rot: rnd() * 6.28, seed: rnd(), inner }); if (inner) colC(x, z, 0.32 * s + 0.12, 8); n++;
}
// island trees
for (const [x, z, s] of [[-51, -32, 1.1], [-47, -27, 0.9], [-53, -26, 1.0]]) TREES.push({ x, z, y: H(x, z), s, pine: true, rot: rnd() * 6, seed: rnd(), inner: true }) && colC(x, z, 0.4, 8);
for (let tries = 0, n = 0; tries < 9000 && n < 260; tries++) {
  const x = (rnd() * 2 - 1) * (HALF - 4), z = (rnd() * 2 - 1) * (HALF - 4); if (!clearOf(x, z, 1.1)) continue; if (H(x, z) > SNOW_Y - 2) continue;
  let ok = true; for (const t of TREES) if (dist2(x, z, t.x, t.z) < 4) { ok = false; break; } if (!ok) continue; for (const b of BUSHES) if (dist2(x, z, b.x, b.z) < 9) { ok = false; break; } if (!ok) continue;
  const s = 0.55 + rnd() * 0.5; const berry = n % 9 === 4; const b = { x, z, s, y: H(x, z), seed: rnd(), berry, hide: s > 0.95 };
  BUSHES.push(b); if (b.hide) HIDES.push({ id: 'bush' + HIDES.length, kind: 'bush', x, z, bush: BUSHES.length - 1 }); if (berry) BERRIES.push({ id: 'berry' + BERRIES.length, x, z, bush: BUSHES.length - 1 }); n++;
}
for (let tries = 0, n = 0; tries < 6000 && n < 190; tries++) {
  const x = (rnd() * 2 - 1) * 200, z = (rnd() * 2 - 1) * 200; const h = H(x, z);
  const nearLake = Math.abs(lakeSD(x, z) + 2) < 3; const s = (nearLake ? 0.4 : 0.5) + rnd() * (h > 15 ? 2.2 : 1.1);
  if (h < -0.2 && !nearLake) continue; if (!clearOf(x, z, s) && !(nearLake && roadDist(x, z) > 4 && trailDist(x, z) > 3 && !deckAt(x, z) && Math.hypot(x - DOCK.x, z - DOCK.z) > 12 && Math.hypot(x + 35, z - 27) > 18)) continue;
  ROCKS.push({ x, z, y: h, s, rot: rnd() * 6.28, seed: rnd() }); if (Math.abs(x) < HALF && Math.abs(z) < HALF && s > 0.6) colC(x, z, s * 0.85, s * 1.2, s > 1.4); n++;
}

// --- skipping stones, golden acorns, collectibles ---
export const SKIP_SPOTS = [{ id: 'skip0', ...pt(lakePoint(1.75, -3.2)) }, { id: 'skip1', ...pt(lakePoint(0.35, -2.6)) }, { id: 'skip2', ...pt(lakePoint(3.9, -2.8)) }];
function pt([x, z]) { return { x, z }; }
for (const s of SKIP_SPOTS) { const th = Math.atan2(s.z - LAKE.z, (s.x - LAKE.x) / LAKE.sx); s.dir = th + Math.PI; }
export const ACORNS = [
  [-112, -110], [41, -88], [-50, -29], [-61, 82], [128, 106], [68, 40], [-33, 33], [22, 74], [-96, 56], [-122, -20], [4, -104], [100, 54],
].map(([x, z], i) => ({ id: 'acorn' + i, x, z }));
export const FINDS = [ // daily-respawning collectibles
  { id: 'f0', item: 'feather', x: -8, z: 48 }, { id: 'f1', item: 'seashell', x: -38, z: 20 }, { id: 'f2', item: 'geode', x: -104, z: -60 },
  { id: 'f3', item: 'feather', x: 84, z: 20 }, { id: 'f4', item: 'seashell', x: -22, z: 23 }, { id: 'f5', item: 'oldcoin', x: 90, z: -40 },
  { id: 'f6', item: 'geode', x: 60, z: -96 }, { id: 'f7', item: 'feather', x: -76, z: 100 }, { id: 'f8', item: 'pinecone', x: -30, z: -90 }, { id: 'f9', item: 'pinecone', x: 70, z: 70 },
];
for (const f of [...ACORNS, ...FINDS]) { f.y = ground(f.x, f.z); }

// --- patrols ---
export const PATROL_RANGER = [[16, 60], [28, 46], [38, 32], [33, 14], [44, 5], [58, 6], [68, 20], [64, 40], [48, 46], [34, 38], [28, 6], [25, -14], [24, -20], [18, -20], [24, -18], [16, 6], [0, 20], [-16, 26], [-30, 31], [-42, 31], [-28, 30], [-6, 26], [12, 32], [22, 50]];
export const PATROL_DEPUTY = [[70, 48], [84, 64], [104, 78], [124, 80], [140, 82], [124, 90], [106, 88], [92, 74], [72, 52], [66, 32], [58, 12], [44, 4], [36, 18], [56, 46]];

// --- line of sight / collision queries ---
const CELL = 8, CG = new Map();
function cellKey(i, j) { return i * 1000 + j; }
export function rebuildGrid() {
  CG.clear();
  COLS.forEach((c, idx) => { const r = c.k === 'c' ? c.r : Math.hypot(c.hw, c.hd); const i0 = Math.floor((c.x - r) / CELL), i1 = Math.floor((c.x + r) / CELL), j0 = Math.floor((c.z - r) / CELL), j1 = Math.floor((c.z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = cellKey(i, j); if (!CG.has(k)) CG.set(k, []); CG.get(k).push(idx); } });
}
export function addCollider(c) { COLS.push(c); rebuildGrid(); }
export function nearCols(x, z, r) {
  const out = new Set(); const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = CG.get(cellKey(i, j)); if (a) for (const k of a) out.add(k); }
  return [...out].map(k => COLS[k]);
}
// resolve circle (x,z,r) against colliders, returns [x,z]
export function collide(x, z, r, yFeet = 0) {
  for (let it = 0; it < 2; it++) for (const c of nearCols(x, z, r + 1)) {
    if (c.k === 'c') { if (c.r <= 0) continue; const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { x = c.x + dx / d * m; z = c.z + dz / d * m; } }
    else { if (c.hw <= 0) continue; const dx = x - c.x, dz = z - c.z; let lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c; const ex = c.hw + r, ez = c.hd + r;
      if (Math.abs(lx) < ex && Math.abs(lz) < ez) { if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez; x = c.x + lx * c.c - lz * c.s; z = c.z + lx * c.s + lz * c.c; } }
  }
  const lim = HALF - 1; x = clamp(x, -lim, lim); z = clamp(z, -lim, lim);
  return [x, z];
}
function segHitsBox(ax, az, bx, bz, c) {
  const tl = p => [(p[0] - c.x) * c.c + (p[1] - c.z) * c.s, -(p[0] - c.x) * c.s + (p[1] - c.z) * c.c];
  const [x0, z0] = tl([ax, az]), [x1, z1] = tl([bx, bz]); let t0 = 0, t1 = 1; const dx = x1 - x0, dz = z1 - z0;
  for (const [p, q] of [[-dx, x0 + c.hw], [dx, c.hw - x0], [-dz, z0 + c.hd], [dz, c.hd - z0]]) { if (p === 0) { if (q < 0) return false; } else { const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } }
  return t0 < t1 && t1 > 0.02 && t0 < 0.98;
}
export function losBlocked(ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az); const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  for (const c of nearCols(mx, mz, len / 2 + 1)) {
    if (!c.los) continue;
    if (c.k === 'b') { if (segHitsBox(ax, az, bx, bz, c)) return true; }
    else { const dx = bx - ax, dz = bz - az; let t = ((c.x - ax) * dx + (c.z - az) * dz) / (len * len); t = clamp(t, 0, 1); if (t > 0.05 && t < 0.95 && dist(ax + dx * t, az + dz * t, c.x, c.z) < c.r * 0.85) return true; }
  }
  // terrain ridge occlusion
  for (let k = 1; k < 6; k++) { const t = k / 6; const x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (H(x, z) > lerp(ground(ax, az), ground(bx, bz), t) + 1.6) return true; }
  return false;
}
rebuildGrid();

export const SPAWN = { x: LOC.home.x, z: LOC.home.z, rot: Math.PI * 0.8 };
