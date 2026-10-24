// Jax's Adventures - game simulation (renderer independent, deterministic step)
import { clamp, lerp, smooth, wrapAng, angLerp, dist, dist2, mulberry32 } from './util.js';
import * as W from './world.js';
import { ITEMS, FOODS, FISH, FISH_BY_ID, SPECIES, RODS, SHOP, SHOP_BY_ID, RECIPES, NPCS, CAMPERS, CHAPTERS, SIDE_QUESTS, TIPS } from './data.js';

export const DT = 1 / 60;
export const HOUR_SECS = 30;            // real seconds per game hour (24h day = 12 min)
const SAVE_KEY = 'jaxadv.save.v1';
export const SPEED = { walk: 3.2, run: 5.6, sneak: 1.7, swim: 2.1, bike: 9.5, bikeFast: 11, canoe: 4.2, canoeFast: 5.4 };

export let G = null;
let rng = Math.random;
const ev = (t, o = {}) => { G.ev.push(Object.assign({ t }, o)); };
export const toast = (text, col = '#fff', dur = 3.2) => { const dup = G.toasts.find(t => t.text === text); if (dup) { dup.t = Math.min(dup.t, 0.3); return; } G.toasts.push({ text, col, t: 0, dur }); if (G.toasts.length > 4) G.toasts.shift(); ev('sfx', { name: 'toast' }); };
const say = (npc, text, dur = 3) => { npc.say = text; npc.sayT = dur; };

// ---------------------------------------------------------------- new game
export function newGame(seed = 1) {
  rng = mulberry32(seed * 7919 + 13);
  G = {
    v: 1, t: 0, clock: 8.0, day: 1, ev: [], toasts: [], paused: false, menu: null, banner: null,
    weather: { kind: 'clear', rain: 0, cloud: 0.25, next: 5 + rng() * 4, wind: 0.4 },
    p: { x: W.SPAWN.x, z: W.SPAWN.z, y: W.ground(W.SPAWN.x, W.SPAWN.z), vy: 0, rot: W.SPAWN.rot, vx: 0, vz: 0, spd: 0, crouch: false, running: false, swim: false, bike: false, canoe: false, hidden: null, onGround: true, anim: 'idle', animT: 0, grabT: 0, stepAcc: 0, celebrateT: 0, jumpT: 0 },
    coins: 0, inv: [], chest: [], slots: 8,
    owned: { rod: 0, bike: false, canoe: false, spinner: false, glow: false, capshades: false, tourist: false, jrvest: false, decor: {} },
    equip: { lure: null, disguise: null }, bait: 0,
    journal: {}, quest: { ch: 0, step: 0, done: false }, side: {}, flags: {}, acorns: {}, finds: {}, berries: {},
    stats: { grabs: 0, fishCaught: 0, sold: 0, hides: 0, trades: 0, skipBest: 0, cooked: 0, caught: 0, spotted: 0, steps: 0 },
    canoe: { x: 7.5, z: -17.4, rot: Math.PI, launched: false, vx: 0, vz: 0 },
    fish: null, skip: null, caught: null, party: null, sleepFade: 0,
    npcs: [], stash: {}, trades: [], willaRates: null, autosaveT: 0, lastSaveT: 0,
  };
  for (const s of W.STASHES) G.stash[s.id] = { items: [], guard: 0 };
  spawnNPCs(); restock(true); rollTrades();
  return G;
}

// ---------------------------------------------------------------- NPCs
function mkNpc(id, kind, x, z, o = {}) { const d = NPCS[id]; return Object.assign({ id, kind, def: d, name: d.name, x, z, y: W.ground(x, z), rot: 0, spd: 0, anim: 'idle', animT: rng() * 10, state: 'idle', timer: 0, aware: 0, alert: null, alertT: 0, say: null, sayT: 0, visible: true, tx: x, tz: z, look: 0, lookT: 0 }, o); }
function spawnNPCs() {
  const N = G.npcs;
  N.push(mkNpc('gus', 'fixed', W.LOC.dockEnd.x + 0.8, W.LOC.dockEnd.z - 1.1, { rot: Math.PI, anim: 'fishsit', y: 0.75 }));
  N.push(mkNpc('hollis', 'fixed', W.LOC.storeDoor.x + 1.6, W.LOC.storeDoor.z + 0.6, { rot: -Math.PI / 2, anim: 'idle' }));
  N.push(mkNpc('willa', 'fixed', W.LOC.tradeDoor.x + 1.6, W.LOC.tradeDoor.z + 0.4, { rot: -Math.PI / 2, anim: 'idle' }));
  N.push(mkNpc('ranger', 'ranger', 16, 60, { route: W.PATROL_RANGER, wp: 0, lastX: 0, lastZ: 0, lost: 0, searchT: 0, state: 'patrol' }));
  N.push(mkNpc('deputy', 'ranger', 70, 48, { route: W.PATROL_DEPUTY, wp: 0, lastX: 0, lastZ: 0, lost: 0, searchT: 0, visible: false, deputy: true, state: 'patrol' }));
  for (const c of CAMPERS) {
    const home = campHome(c.site);
    N.push(mkNpc(c.id, 'camper', home.x + rng() * 2 - 1, home.z + rng() * 2 - 1, { site: c.site, kidc: !!c.kid, sleepy: !!c.sleepy, beach: !!c.beach, act: 'sit', actT: rng() * 6 }));
  }
}
export const npc = id => G.npcs.find(n => n.id === id);
function campHome(site) { if (site >= 5) { const b = W.BEACH_SPOTS[site - 5]; return { x: b.x, z: b.z, rot: b.rot }; } const s = W.SITES[site]; return { x: s.x, z: s.z, rot: s.rot }; }
function seatFor(n) {
  if (n.site >= 5) { const b = W.BEACH_SPOTS[n.site - 5]; return { x: b.x + 0.2, z: b.z - 0.6, rot: b.rot + Math.PI / 2 }; }
  const s = W.SITES[n.site]; const t = s.table; const k = CAMPERS.filter(c => c.site === n.site).findIndex(c => c.id === n.id);
  const side = k % 2 ? 1 : -1; const tr = t.rot; const lx = (k > 1 ? -0.45 : 0.45), lz = side * 0.95;
  const x = t.x + lx * Math.cos(tr) - lz * Math.sin(tr), z = t.z + lx * Math.sin(tr) + lz * Math.cos(tr);
  return { x, z, rot: Math.atan2(t.z - z, t.x - x) };
}
export function rangerLevel() { return clamp(G.quest.ch + (G.quest.done ? 1 : 0), 0, 3); }

// ---------------------------------------------------------------- items / inventory
export function itemValue(it) {
  if (it.fish) { const f = FISH_BY_ID[it.fish.sp]; const [a, b] = f.size || [1, 1]; const sz = clamp((it.fish.size - a) / ((b - a) || 1), 0, 1); return Math.round(f.value * (0.7 + 0.6 * sz)); }
  if (it.val) return it.val; const d = ITEMS[it.id]; return d ? d.value : 1;
}
export function itemName(it) { if (it.fish) return FISH_BY_ID[it.fish.sp].name; return ITEMS[it.id] ? ITEMS[it.id].name : it.id; }
export function itemCat(it) { if (it.fish) return FISH_BY_ID[it.fish.sp].junk ? 'junk' : 'fish'; return ITEMS[it.id] ? ITEMS[it.id].cat : 'junk'; }
export function addItem(it, quiet) { if (G.inv.length >= G.slots) { if (!quiet) toast('Backpack full! Sell or stash something.', '#ffb04a'); return false; } G.inv.push(it); return true; }
export const countItem = (id, list = G.inv) => list.filter(i => i.id === id || (i.fish && i.fish.sp === id)).length;
function takeItem(id) { const k = G.inv.findIndex(i => i.id === id || (i.fish && i.fish.sp === id)); if (k < 0) return null; return G.inv.splice(k, 1)[0]; }
export const rodTier = () => G.owned.rod;
export function disguiseLvl() { const d = G.equip.disguise; return d ? SHOP_BY_ID[d].lvl : 0; }
export const carryingFood = () => G.inv.some(i => itemCat(i) === 'food');

// ---------------------------------------------------------------- stashes
function restock(all) {
  for (const s of W.STASHES) {
    const st = G.stash[s.id]; if (!all && st.items.length >= 2) continue;
    const rv = s.site < 5 && W.SITES[s.site].camp === 'rv';
    const pool = s.kind === 'basket' ? ['sandwich', 'apple', 'cookies', 'marshmallows', 'chocolate', 'popcorn', 'cheese', 'corn', 'donut', 'watermelon', 'marshmallows', 'chocolate']
      : ['soda', 'hotdog', 'cheese', 'watermelon', 'sandwich', 'soda', 'hotdog', 'chocolate', 'marshmallows'];
    const n = 2 + (rng() < 0.5 ? 1 : 0); st.items = [];
    for (let i = 0; i < n; i++) st.items.push(rv && s.kind === 'cooler' && rng() < 0.3 ? 'pie' : pool[Math.floor(rng() * pool.length)]);
  }
  const bb = G.stash.beachbasket0; if (bb && !G.stats.grabs) bb.items[bb.items.length - 1] = 'sandwich';
}
function rollTrades() {
  const r = mulberry32(G.day * 977 + 3); const pick = a => a[Math.floor(r() * a.length)];
  const mult = () => Math.round((0.8 + r() * 0.8) * 10) / 10;
  G.willaRates = { fish: mult(), food: mult(), collectible: Math.round((1 + r() * 1.0) * 10) / 10, cooked: mult(), junk: 1, quest: 1, hot: pick([...FOODS, 'perch', 'bluegill', 'brooktrout', 'whitefish', 'feather', 'geode']) };
  const pool = [
    { give: [{ cat: 'fish', n: 2 }], get: { bait: 5 } },
    { give: [{ cat: 'food', n: 3 }], get: { coins: 26 + Math.floor(r() * 26) } },
    { give: [{ cat: 'collectible', n: 1 }], get: { coins: 30 + Math.floor(r() * 30) } },
    { give: [{ cat: 'fish', n: 3 }], get: { gear: 'capshades' }, label: 'Cap & Shades', need: () => !G.owned.capshades },
    { give: [{ id: pick(['perch', 'bluegill', 'brooktrout']), n: 1 }, { cat: 'food', n: 1 }], get: { gear: 'spinner' }, label: 'Spinner Lure', need: () => !G.owned.spinner },
    { give: [{ id: 'feather', n: 2 }], get: { decor: 'flag' }, label: 'Pirate Flag', need: () => !G.owned.decor.flag },
    { give: [{ cat: 'food', n: 2 }], get: { item: pick(['marshmallows', 'chocolate']) } },
    { give: [{ cat: 'fish', n: 1, rare: 2 }], get: { coins: 60 + Math.floor(r() * 40) } },
    { give: [{ id: 'pinecone', n: 1 }], get: { item: 'chocolate' } },
    { give: [{ cat: 'food', n: 4 }], get: { gear: 'tourist' }, label: 'Tourist Kit', need: () => !G.owned.tourist },
  ];
  const list = [pool[1], pool[0]]; const idx = [...pool.keys()].slice(2);
  while (list.length < 5 && idx.length) list.push(pool[idx.splice(Math.floor(r() * idx.length), 1)[0]]);
  G.trades = list.map((o, i) => Object.assign({ k: i, used: false }, o));
}

// ---------------------------------------------------------------- time / weather
export const timeOfDay = (h = G.clock) => h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 18 ? 'day' : h >= 18 && h < 21 ? 'dusk' : 'night';
export const isNight = () => G.clock >= 20.5 || G.clock < 5.5;
export const sunHeight = (h = G.clock) => Math.sin((h - 6) / 24 * Math.PI * 2);
export function advanceClock(dh) {
  const before = G.clock; G.clock += dh; let wrapped = false;
  if (G.clock >= 24) { G.clock -= 24; G.day++; wrapped = true; rollTrades(); G.finds = {}; G.berries = {}; }
  const crossed = h => wrapped ? (before < h || G.clock >= h) : (before < h && G.clock >= h);
  if (crossed(6)) restock(true); if (crossed(13)) restock(false);
  const w = G.weather; w.next -= dh;
  if (w.next <= 0) { const r = rng(); w.kind = r < 0.5 ? 'clear' : r < 0.78 ? 'cloudy' : 'rain'; w.next = 3 + rng() * 6; if (w.kind === 'rain') toast('It\'s starting to rain - rare fish are biting!', '#9fd0ff'); }
}
export function setWeather(kind) { G.weather.kind = kind; G.weather.next = 6; }

// ---------------------------------------------------------------- perception
export function seen(w, range, fovHalf) {
  const p = G.p; if (p.hidden) return 0;
  const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz); if (d > range) return 0;
  const fwd = w.rot + (w.look || 0); const a = Math.abs(wrapAng(Math.atan2(dz, dx) - fwd));
  const close = d < (p.crouchNow ? 1.4 : p.running || p.bike ? 4.5 : 2.4);
  if (a > fovHalf && !close) return 0;
  if (W.losBlocked(w.x, w.z, p.x, p.z)) return 0;
  if (p.crouchNow) for (const b of W.BUSHES) if (dist2(b.x, b.z, p.x, p.z) < (1.1 * b.s) ** 2) return 0;
  return clamp(1.25 - d / range, 0.15, 1) * (a > fovHalf ? 0.6 : 1);
}
function senseMul() { const p = G.p; let m = 1; if (p.crouchNow) m *= 0.55; if (p.bike) m *= 1.2; if (p.swim) m *= 0.8; return m; }
const nightMul = () => { const sh = sunHeight(); return sh > 0.05 ? 1 : lerp(0.62, 1, clamp((sh + 0.25) / 0.3, 0, 1)); };

function spot(by) {
  G.stats.spotted++; ev('sfx', { name: 'spotted' });
  if (by.kind === 'ranger') { by.state = 'chase'; by.alert = '!'; by.aware = 1; by.lost = 0; by.lastX = G.p.x; by.lastZ = G.p.z; say(by, rng() < 0.5 ? 'Hey! Stop right there!' : 'Snack bandit! Gotcha now!', 2.5); ev('sfx', { name: 'whistle' }); }
  else {
    by.alert = '!'; by.alertT = 5; by.aware = 1; say(by, by.kidc ? 'Mom! Someone took our snacks!' : rng() < 0.5 ? 'Hey! That\'s our picnic!' : 'Ranger! Snack thief over here!', 3);
    for (const s of W.STASHES) if (s.site === by.site) G.stash[s.id].guard = 45;
    for (const r of G.npcs) if (r.kind === 'ranger' && r.visible && r.state !== 'chase') { r.state = 'alerted'; r.tx = G.p.x; r.tz = G.p.z; r.aware = Math.max(r.aware, 0.55); r.alert = '?'; }
  }
}

// ---------------------------------------------------------------- NPC update
function moveNpc(n, tx, tz, speed, dt) {
  const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
  if (d < 0.15) { n.spd = 0; return true; }
  const st = Math.min(d, speed * dt); let nx = n.x + dx / d * st, nz = n.z + dz / d * st;
  [nx, nz] = W.collide(nx, nz, 0.32);
  if (W.H(nx, nz) < 0.05 && !W.deckAt(nx, nz)) { n.spd = 0; n.blocked = (n.blocked || 0) + dt; return false; }
  let moved = Math.hypot(nx - n.x, nz - n.z);
  n.blocked = moved < st * 0.3 ? (n.blocked || 0) + dt : 0;
  if (n.blocked > 0.5) {
    const s = (n.side = n.side || (rng() < 0.5 ? 1 : -1)); const ax = -dz / d * s, az = dx / d * s;
    [nx, nz] = W.collide(n.x + ax * speed * dt, n.z + az * speed * dt, 0.32); moved = Math.hypot(nx - n.x, nz - n.z); if (n.blocked > 2) { n.side = -s; n.blocked = 0.51; }
  }
  n.x = nx; n.z = nz; n.y = W.ground(nx, nz); n.spd = moved / dt;
  n.rot = angLerp(n.rot, Math.atan2(dz, dx), clamp(dt * 8, 0, 1));
  return false;
}
function updateRanger(n, dt) {
  const lvl = rangerLevel(); const p = G.p;
  if (n.deputy) { const on = G.quest.ch >= 2 || G.quest.done; n.visible = on; if (!on) return; }
  const tut = G.quest.ch === 0 && G.quest.step < 5;
  const range = (13.5 + lvl * 1.6) * nightMul() * (G.weather.rain > 0.5 ? 0.85 : 1) * senseMul() * (tut ? 0.7 : 1);
  const runSpd = 4.5 + lvl * 0.35, walk = 1.6 + lvl * 0.1;
  const dl = disguiseLvl(); let susp = 1 + (carryingFood() ? 0.7 : 0) + (inCampsite(p.x, p.z) ? 0.3 : 0) + (isNight() ? 0.2 : 0);
  susp *= [1, 0.6, 0.38, 0.15][dl]; if (dl >= 2 && !carryingFood() && !isNight()) susp *= 0.3;
  const vis = G.caught || G.party ? 0 : seen(n, range, 0.9);
  n.flash = isNight() ? 1 : 0; n.range = range;
  if (n.state === 'chase') {
    if (vis > 0 || (!p.hidden && dist(n.x, n.z, p.x, p.z) < 3.5)) { n.lost = 0; n.lastX = p.x; n.lastZ = p.z; } else n.lost += dt;
    const water = p.swim || p.canoe;
    moveNpc(n, n.lastX, n.lastZ, runSpd, dt); n.anim = n.spd > 0.5 ? 'run' : 'look';
    if (!p.hidden && !water && dist(n.x, n.z, p.x, p.z) < 1.0 && Math.abs(n.y - p.y) < 1.2) { getCaught(n); return; }
    if (n.lost > 3.2 || (water && n.lost > 1.5) || (water && n.spd < 0.3 && dist(n.x, n.z, p.x, p.z) > 4)) { n.state = 'search'; n.searchT = 6; n.alert = '?'; n.aware = 0.6; say(n, water ? 'Hmph. I don\'t swim on duty!' : 'Where did that kid go?', 2.5); }
    return;
  }
  if (vis > 0) {
    const rate = (0.75 + 0.22 * lvl) * vis * susp * (tut ? 0.6 : 1); n.aware = Math.min(1, n.aware + rate * dt);
    if (n.aware >= 1) { spot(n); return; }
    if (n.aware > 0.3) { n.alert = '?'; n.rot = angLerp(n.rot, Math.atan2(p.z - n.z, p.x - n.x), dt * 3); n.tx = p.x; n.tz = p.z; if (n.state !== 'alerted') n.state = 'investigate'; }
  } else {
    const d = dist(n.x, n.z, p.x, p.z); if (!p.hidden && (p.running || p.bike) && d < 6 && !p.crouchNow) n.aware = Math.min(0.95, n.aware + 0.3 * dt * susp);
    else n.aware = Math.max(0, n.aware - 0.22 * dt);
    if (n.aware < 0.12 && n.alert === '?' && n.state !== 'search' && n.state !== 'alerted') { n.alert = null; n.state = 'patrol'; }
  }
  if (n.state === 'alerted' || n.state === 'investigate') {
    const done = moveNpc(n, n.tx, n.tz, n.state === 'alerted' ? runSpd * 0.85 : walk * 1.2, dt); n.anim = n.spd > 2.5 ? 'run' : n.spd > 0.2 ? 'walk' : 'look';
    if (done || n.blocked > 3) { n.state = 'search'; n.searchT = 4; }
    return;
  }
  if (n.state === 'search') { n.searchT -= dt; n.anim = 'look'; n.look = Math.sin(G.t * 1.6) * 0.9; if (n.searchT <= 0) { n.state = 'patrol'; n.alert = null; n.look = 0; n.aware = Math.min(n.aware, 0.2); } return; }
  n.state = 'patrol';
  let route = n.route; if (tut && !n.deputy) route = route.slice(0, 10);
  if (n.wp >= route.length) n.wp = 0;
  if (n.timer > 0) { n.timer -= dt; n.anim = 'look'; n.look = Math.sin(G.t * 1.1) * 1.0; return; }
  n.look = Math.sin(G.t * 0.5 + n.x) * 0.35;
  const [tx, tz] = route[n.wp]; if (moveNpc(n, tx, tz, walk, dt) || n.blocked > 4) { n.wp = (n.wp + 1) % route.length; if (rng() < 0.35) n.timer = 1.5 + rng() * 2.5; n.blocked = 0; }
  n.anim = n.spd > 0.2 ? 'walk' : 'idle';
}
export function inCampsite(x, z) { for (const s of W.SITES) if (dist2(s.x, s.z, x, z) < 64) return true; for (const b of W.BEACH_SPOTS) if (dist2(b.x, b.z, x, z) < 36) return true; return false; }
function camperAwake(n) { if (n.beach) return G.clock >= 9 && G.clock < 19; return !(G.clock >= 22 || G.clock < 6.5); }
function updateCamper(n, dt) {
  const awake = camperAwake(n) || n.partyGuest; n.visible = awake;
  if (n.partyGuest) return;
  if (!awake) { n.aware = 0; n.alert = null; n.act = 'sleep'; n.anim = 'sleep'; const h = campHome(n.site); n.x = h.x; n.z = h.z; return; }
  if (n.alertT > 0) { n.alertT -= dt; n.rot = angLerp(n.rot, Math.atan2(G.p.z - n.z, G.p.x - n.x), dt * 4); n.anim = 'point'; if (n.alertT <= 0) { n.alert = null; n.aware = 0.3; } return; }
  n.actT -= dt;
  if (n.actT <= 0) {
    const r = rng(); const night = G.clock > 19;
    n.act = n.kidc ? (r < 0.5 ? 'play' : 'sit') : n.sleepy && r < 0.5 ? 'nap' : r < 0.55 ? 'sit' : r < 0.8 ? (night || n.site >= 5 ? 'sit' : 'fire') : 'wander';
    if (n.beach && r > 0.85) n.act = 'nap';
    n.actT = 7 + rng() * 10; n.dest = null;
  }
  if (G.quest.ch === 0 && G.quest.step <= 1 && n.id === 'tasha' && G.stats.grabs === 0) { n.act = 'nap'; n.actT = 5; }
  const seat = seatFor(n); const home = campHome(n.site);
  if (n.act === 'sit' || n.act === 'nap') {
    if (!moveNpc(n, seat.x, seat.z, 1.5, dt)) n.anim = 'walk';
    else { n.anim = n.act === 'nap' ? 'nap' : 'sit'; n.lookT -= dt; if (n.lookT <= 0) { n.lookTarget = (rng() * 2 - 1) * 2.0; n.lookT = 2.5 + rng() * 4; } n.look = lerp(n.look || 0, n.lookTarget || 0, dt * 2); n.rot = angLerp(n.rot, seat.rot, dt * 3); }
  } else if (n.act === 'fire' && n.site < 5) {
    const f = W.SITES[n.site].fire; if (!n.dest) { const a = rng() * 6.28; n.dest = [f.x + Math.cos(a) * 1.5, f.z + Math.sin(a) * 1.5]; }
    if (!moveNpc(n, n.dest[0], n.dest[1], 1.5, dt)) n.anim = 'walk'; else { n.anim = 'idle'; n.rot = angLerp(n.rot, Math.atan2(f.z - n.z, f.x - n.x), dt * 3); n.look = Math.sin(G.t * 0.7 + n.x) * 1.2; }
  } else {
    if (!n.dest) { const a = rng() * 6.28, r = n.kidc ? 3 + rng() * 5 : 2 + rng() * 4; n.dest = [home.x + Math.cos(a) * r, home.z + Math.sin(a) * r]; }
    const arrived = moveNpc(n, n.dest[0], n.dest[1], n.kidc ? 2.8 : 1.4, dt); n.anim = n.spd > 2 ? 'run' : n.spd > 0.1 ? 'walk' : 'idle';
    if (arrived || n.blocked > 2) { n.dest = null; n.blocked = 0; }
    n.look = Math.sin(G.t * 0.9 + n.z) * 0.6;
  }
  const p = G.p; let nearStash = false;
  for (const s of W.STASHES) if (s.site === n.site && dist2(s.x, s.z, p.x, p.z) < 42) nearStash = true;
  const vis = nearStash && n.anim !== 'nap' ? seen(n, 9.5 * nightMul() * senseMul(), 1.05) : 0;
  const susp = [1, 0.65, 0.45, 0.3][disguiseLvl()];
  if (vis > 0) { n.aware = Math.min(1, n.aware + (0.85 + rangerLevel() * 0.12) * vis * susp * dt); if (n.aware >= 1) spot(n); else if (n.aware > 0.3) n.alert = '?'; }
  else { n.aware = Math.max(0, n.aware - 0.3 * dt); if (n.aware < 0.25) n.alert = null; }
}
function updateNPCs(dt) {
  for (const n of G.npcs) {
    n.animT += dt; if (n.sayT > 0) { n.sayT -= dt; if (n.sayT <= 0) n.say = null; }
    if (G.party && G.party.seats[n.id]) continue;
    if (n.kind === 'ranger') updateRanger(n, dt); else if (n.kind === 'camper') updateCamper(n, dt);
    else { const d = dist(n.x, n.z, G.p.x, G.p.z); if (d < 6 && n.id !== 'gus') n.rot = angLerp(n.rot, Math.atan2(G.p.z - n.z, G.p.x - n.x), dt * 3); }
  }
  for (const s of Object.values(G.stash)) if (s.guard > 0) s.guard -= dt;
}
function getCaught(by) {
  const p = G.p; G.caught = { t: 0, by: by.id }; p.hidden = null; G.fish = null; G.skip = null; p.bike = false;
  say(by, 'Gotcha! Time to go home, young man.', 3); ev('sfx', { name: 'whistle' }); ev('sfx', { name: 'caught' }); by.anim = 'idle';
}
function finishCaught() {
  const p = G.p;
  const keep = G.inv.filter(i => (ITEMS[i.id] && ITEMS[i.id].keep) || (i.fish && FISH_BY_ID[i.fish.sp].r >= 4));
  const lost = G.inv.length - keep.length; G.inv = keep; G.stats.caught++;
  p.x = W.LOC.home.x; p.z = W.LOC.home.z; p.y = W.ground(p.x, p.z); p.vx = p.vz = 0; p.canoe = false; p.swim = false; p.crouch = false;
  advanceClock(1.5);
  for (const n of G.npcs) if (n.kind === 'ranger') { n.state = 'patrol'; n.aware = 0; n.alert = null; n.timer = 0; n.x = n.deputy ? 70 : 16; n.z = n.deputy ? 48 : 60; n.y = W.ground(n.x, n.z); n.wp = 0; }
  G.caught = null; ev('teleport');
  toast(lost ? `Ranger Bramble walked you home and kept ${lost} item${lost > 1 ? 's' : ''} from your backpack.` : 'Ranger Bramble walked you home. Be sneakier!', '#ffb04a', 5);
  save();
}

// ---------------------------------------------------------------- interaction context
export function fireLit() { return G.clock >= 18 && G.clock < 23; }
function tentFree(h) { return G.npcs.filter(n => n.kind === 'camper' && n.site === h.site).every(c => c.visible); }
function landingPoint() {
  const p = G.p;
  for (const r of [1.6, 2.4, 3.2]) for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; const x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r; if (W.H(x, z) > 0.15 || W.deckAt(x, z)) return { x, z }; }
  return null;
}
export function getCtx() {
  const p = G.p; if (G.caught || G.party || G.fish || G.skip) return null;
  if (p.hidden) return { k: 'unhide', label: 'Leave hiding spot' };
  if (p.canoe) { const land = landingPoint(); return land ? { k: 'exitCanoe', label: 'Hop out of canoe', land } : null; }
  const c = []; const add = (k, label, x, z, r, o = {}) => { const d = dist(p.x, p.z, x, z); if (d < r) c.push(Object.assign({ k, label, d: d - (o.pri || 0) }, o)); };
  for (const n of G.npcs) { if (!n.visible || (n.kind === 'ranger' && (n.state !== 'patrol' || n.aware > 0.3))) continue; add('talk', 'Talk to ' + n.name, n.x, n.z, n.kind === 'fixed' ? 2.6 : 2.0, { npc: n.id, pri: 0.4 }); }
  for (const s of W.STASHES) { const st = G.stash[s.id]; if (!st.items.length) continue; const lab = st.guard > 0 ? 'Too risky - they\'re watching!' : 'Grab ' + ITEMS[st.items[st.items.length - 1]].name; add('grab', lab, s.x, s.z, 1.7, { stash: s.id, blocked: st.guard > 0, pri: 0.3 }); }
  for (const h of W.HIDES) { if (h.kind === 'tent' && !tentFree(h)) continue; add('hide', h.kind === 'bush' ? 'Hide in bush' : h.kind === 'bin' ? 'Hide in trash bin' : 'Hide in tent', h.x, h.z, h.kind === 'bush' ? 1.9 * W.BUSHES[h.bush].s : 1.4, { hide: h.id }); }
  for (const a of W.ACORNS) if (!G.acorns[a.id]) add('pick', 'Pick up Golden Acorn', a.x, a.z, 1.5, { acorn: a.id, pri: 1 });
  for (const f of W.FINDS) if (!G.finds[f.id]) add('pick', 'Pick up ' + ITEMS[f.item].name, f.x, f.z, 1.5, { find: f.id, pri: 1 });
  for (const b of W.BERRIES) if (!G.berries[b.id]) add('pick', 'Pick Wild Berries', b.x, b.z, 1.9, { berry: b.id });
  for (const s of W.SKIP_SPOTS) add('skip', 'Skip stones', s.x, s.z, 2.4);
  add('chest', 'Open stash chest', W.LOC.chest.x, W.LOC.chest.z, 1.8, { pri: 0.2 });
  add('bed', 'Rest in hideout', W.LOC.hideDoor.x, W.LOC.hideDoor.z, 1.8);
  if (G.owned.decor.firepit) add('cook', G.quest.ch === 3 && G.quest.step === 3 ? 'Light the party fire!' : 'Cook at fire pit', W.LOC.firePit.x, W.LOC.firePit.z, 2.4, { pri: 0.2, pit: true });
  if (fireLit()) for (const s of W.SITES) add('cook', 'Cook at campfire', s.fire.x, s.fire.z, 1.9);
  if (G.owned.canoe) {
    const cd = dist(p.x, p.z, G.canoe.x, G.canoe.z); const dk = W.deckAt(p.x, p.z);
    if (G.canoe.launched && cd < 2.8) c.push({ k: 'board', label: 'Get in canoe', d: cd - 0.5 });
    else if (dk && dk.kind === 'dock') c.push({ k: 'launch', label: 'Launch canoe', d: 1.5 });
  }
  if (!c.length) return null; c.sort((a, b) => a.d - b.d); return c[0];
}
export function interact(ctx = getCtx()) {
  if (!ctx) return false; const p = G.p;
  switch (ctx.k) {
    case 'unhide': { const h = W.HIDES.find(h => h.id === p.hidden); p.hidden = null; ev('sfx', { name: h && h.kind === 'bin' ? 'bin' : 'rustle' }); if (h) { const a = Math.atan2(p.z - h.z, p.x - h.x) || 0; [p.x, p.z] = W.collide(h.x + Math.cos(a) * 1.4, h.z + Math.sin(a) * 1.4, 0.28); p.y = W.ground(p.x, p.z); } return true; }
    case 'talk': talk(ctx.npc); return true;
    case 'grab': {
      if (ctx.blocked) { toast('They\'re watching their snacks closely. Come back later!', '#ffb04a'); return true; }
      const st = G.stash[ctx.stash]; const id = st.items[st.items.length - 1];
      if (!addItem({ id })) return true; st.items.pop(); G.stats.grabs++; p.grabT = 0.45; ev('sfx', { name: 'grab' });
      toast('Got ' + ITEMS[id].icon + ' ' + ITEMS[id].name + '!', '#bff59a', 2);
      const s = W.STASHES.find(s => s.id === ctx.stash);
      for (const n of G.npcs) { if (!n.visible) continue;
        if (n.kind === 'camper' && n.site === s.site && n.anim !== 'nap' && n.alert !== '!') { const v = seen(n, 9.5 * nightMul() * senseMul(), 1.05); if (v > 0) { n.aware = Math.min(1, n.aware + 0.75 * [1, 0.75, 0.6, 0.45][disguiseLvl()]); if (n.aware >= 1) spot(n); else n.alert = '?'; } }
        if (n.kind === 'ranger' && n.state !== 'chase') { const v = seen(n, 14 * nightMul(), 0.9); if (v > 0) { n.aware = Math.min(1, n.aware + 0.6 * [1, 0.7, 0.5, 0.3][disguiseLvl()]); if (n.aware >= 1) spot(n); } } }
      return true;
    }
    case 'hide': {
      const h = W.HIDES.find(h => h.id === ctx.hide);
      for (const n of G.npcs) if (n.kind === 'ranger' && n.visible && n.state === 'chase' && dist(n.x, n.z, h.x, h.z) < 4.5 && !W.losBlocked(n.x, n.z, h.x, h.z)) { say(n, 'I saw you hop in there!', 2.5); toast('He saw you hide! Break line of sight first.', '#ff8a6a'); getCaught(n); return true; }
      p.hidden = h.id; p.bike = false; p.crouch = false; p.vx = p.vz = 0; p.x = h.kind === 'tent' ? h.hx : h.x; p.z = h.kind === 'tent' ? h.hz : h.z; G.stats.hides++; ev('sfx', { name: h.kind === 'bin' ? 'bin' : 'rustle' });
      if (G.quest.ch === 0 && G.quest.step === 5) toast('Nice! Nobody can see you in here.', '#bff59a');
      return true;
    }
    case 'pick': {
      if (ctx.acorn) { G.acorns[ctx.acorn] = true; const n = Object.keys(G.acorns).length; ev('sfx', { name: 'chime' }); toast(`🌰 Golden Acorn! (${n}/12)`, '#ffd84a', 3); save(); return true; }
      if (ctx.find) { const f = W.FINDS.find(f => f.id === ctx.find); if (addItem({ id: f.item })) { G.finds[f.id] = G.day; ev('sfx', { name: 'chime' }); toast('Found ' + ITEMS[f.item].icon + ' ' + ITEMS[f.item].name + '!', '#bff59a', 2); } return true; }
      if (ctx.berry) { if (addItem({ id: 'berries' })) { G.berries[ctx.berry] = G.day; ev('sfx', { name: 'rustle' }); toast('🫐 Picked Wild Berries', '#bff59a', 2); } return true; }
      return true;
    }
    case 'skip': startSkip(); return true;
    case 'chest': G.menu = { k: 'chest' }; ev('sfx', { name: 'open' }); return true;
    case 'bed': G.menu = { k: 'dialog', d: sleepDialog() }; ev('sfx', { name: 'open' }); return true;
    case 'cook':
      if (ctx.pit && G.quest.ch === 3 && G.quest.step === 3) { if (G.clock >= 19 || G.clock < 4) { startParty(); return true; } toast('Wait until after 7pm - rest in your hideout to skip ahead.', '#ffb04a', 3.5); }
      G.menu = { k: 'cook' }; ev('sfx', { name: 'open' }); return true;
    case 'launch': Object.assign(G.canoe, { x: 7.5, z: -17.2, rot: Math.PI, launched: true, vx: 0, vz: 0 }); board(); ev('sfx', { name: 'splash', big: 0.2 }); return true;
    case 'board': board(); return true;
    case 'exitCanoe': p.canoe = false; p.x = ctx.land.x; p.z = ctx.land.z; p.y = W.ground(p.x, p.z); p.swim = false; p.onGround = true; ev('sfx', { name: 'step', surf: 'wood' }); return true;
  }
  return false;
}
function board() { const p = G.p; p.canoe = true; p.bike = false; p.crouch = false; p.swim = false; p.x = G.canoe.x; p.z = G.canoe.z; p.rot = G.canoe.rot; if (!G.flags.canoeTip) { G.flags.canoeTip = true; toast('Paddle with WASD / joystick. F fishes from the canoe!', '#bfe6ff', 3.5); } }

// ---------------------------------------------------------------- dialogs
const curStep = () => { const c = CHAPTERS[G.quest.ch]; return G.quest.done || !c ? null : c.steps[G.quest.step]; };
const onStep = check => { const s = curStep(); return s && s.check === check; };
function sideOffer(id) {
  const q = SIDE_QUESTS[id]; const st = G.side[id];
  if (!q || st === 'done') return null; if (q.after && G.side[q.after] !== 'done') return null;
  if (!st) return { label: '❓ ' + q.title, a: 'side', arg: id };
  if (checkSide(id)) return { label: '✅ Finish: ' + q.title, a: 'sidedone', arg: id };
  return null;
}
export function talk(id) {
  const n = npc(id); const opts = []; let text = '';
  const side = [];
  for (const [qid, q] of Object.entries(SIDE_QUESTS)) if (q.giver === id) { const o = sideOffer(qid); if (o) side.push(o); }
  const pending = Object.entries(SIDE_QUESTS).filter(([qid, q]) => q.giver === id && G.side[qid] === 'active').map(([, q]) => q.t);
  if (id === 'gus') {
    if (!G.flags.metGus) { text = "Well, hello there, young fella! Name's Gus. I've fished this lake for forty years. Here - take my old twig rod and a few worms. Face the water and press F!"; opts.push({ label: 'Thanks, Gus!', a: 'gusRod' }); }
    else if (onStep('gusLegend')) { text = "Silverjaw... the biggest lake trout anyone ever saw. Silver as the moon. She only comes up in the deep water at dawn or dusk, and only for a glowing lure. You'll need a sturdy rod, too."; opts.push({ label: "I'll catch her!", a: 'flag', arg: 'gusLegend' }); }
    else if (onStep('showedGus') && countItem('silverjaw')) { text = "Well I'll be... SILVERJAW! Forty years I waited to see her. You're the best angler in Pinecrest, Jax!"; opts.push({ label: 'We did it!', a: 'flag', arg: 'showedGus' }); }
    else if (onStep('invited') && !G.flags.inv_gus) { text = 'A campfire party at your tree fort? Count me in! I\'ll bring my harmonica.'; opts.push({ label: 'See you there!', a: 'flag', arg: 'inv_gus' }); }
    else { const sp = Object.keys(G.journal).length; text = [`You've logged ${sp} kinds of fish. ${sp < 10 ? 'Keep at it!' : 'Impressive!'}`, 'Fish bite best at dawn and dusk. And rain... rain brings out the rare ones.', 'Different rods catch different fish. A Bamboo Rod will land you bass!', 'The river has trout. The deep lake has the big ones - you\'ll want a canoe.'][Math.floor(G.t / 7) % 4]; }
  } else if (id === 'hollis') {
    text = G.quest.ch === 0 && G.quest.step <= 4 && !G.flags.metHollis ? "Welcome to Hollis General! I'll buy fish and snacks, and I sell everything an adventurer needs." : ['What can I do for you today, Jax?', 'Fresh gear just came in!', 'Got any fish for me?'][Math.floor(G.t / 9) % 3];
    G.flags.metHollis = true;
    opts.push({ label: '🛒 Shop', a: 'shop' }, { label: '💰 Sell', a: 'sell' });
    if (onStep('invited') && !G.flags.inv_hollis) opts.push({ label: '🎉 Invite to party', a: 'flag', arg: 'inv_hollis', reply: 'A party? I\'ll close up early!' });
  } else if (id === 'willa') {
    const hot = G.willaRates.hot; const hn = ITEMS[hot] ? ITEMS[hot].name : FISH_BY_ID[hot].name;
    text = `Howdy, partner! Today's HOT item is ${hn} - I'll pay extra. Let's make a deal!`;
    opts.push({ label: '🔁 Trade', a: 'trade' }, { label: '💰 Sell', a: 'sell' });
    if (onStep('invited') && !G.flags.inv_willa) opts.push({ label: '🎉 Invite to party', a: 'flag', arg: 'inv_willa', reply: 'Yeehaw! I\'ll bring my guitar.' });
  } else if (n.kind === 'ranger') {
    const dl = disguiseLvl();
    text = dl >= 3 ? 'Oh! A Junior Ranger! Keep up the good work, kiddo.' : dl ? 'Hello there, tourist. Enjoy the park - and don\'t feed the wildlife!' : ['Morning, kid. Stay out of trouble.', 'Somebody\'s been swiping picnic snacks. You wouldn\'t know anything about that, would you?', 'Keep the park clean!'][Math.floor(G.t / 8) % 3];
  } else {
    const lines = { mike: 'Great day for camping, huh?', lily: 'Can you skip rocks? I bet I can skip more!', dev: 'Ugh, I dropped my sunglasses off the dock...', rosa: 'Have you seen the view from the lookout tower?', sam: 'I heard there are golden acorns hidden all over this park.', joe: 'Back in my day, we caught our own supper.', maya: 'I\'d love some fresh trout for dinner.', tasha: 'Ahh, the beach. So relaxing...', ben: 'Watch out for the ranger, he\'s strict about snacks!' };
    text = n.aware > 0.6 ? 'Hmm, you look like the kid who\'s been sneaking around...' : lines[id] || 'Hi there!';
  }
  if (pending.length && !side.length) text += '  (' + pending[0] + ')';
  opts.push(...side); opts.push({ label: 'Bye', a: 'close' });
  G.menu = { k: 'dialog', d: { npc: id, name: n.name, role: n.def.role, text, opts } };
  if (n.kind !== 'fixed' || id !== 'gus') n.rot = Math.atan2(G.p.z - n.z, G.p.x - n.x);
  ev('sfx', { name: 'talk' });
}
function sleepDialog() { return { npc: null, name: 'Your Tree Fort', role: 'Hideout', text: 'Cozy in here. Take a nap? (Game is saved when you rest.)', opts: [{ label: '☀️ Sleep till morning (7am)', a: 'sleep', arg: 7 }, { label: '🌇 Rest till evening (7pm)', a: 'sleep', arg: 19 }, { label: '🌅 Rest till dawn (5am)', a: 'sleep', arg: 5.2 }, { label: 'Not now', a: 'close' }] }; }
export function act(a, arg, o = {}) {
  switch (a) {
    case 'close': G.menu = null; return;
    case 'gusRod': G.owned.rod = Math.max(G.owned.rod, 1); G.bait += 5; G.flags.metGus = true; G.menu = null; toast('🎣 Got the Twig Rod and 5 worms!', '#bff59a'); ev('sfx', { name: 'chime' }); return;
    case 'flag': G.flags[arg] = true; if (o.reply) { G.menu.d = Object.assign({}, G.menu.d, { text: o.reply, opts: [{ label: 'Bye', a: 'close' }] }); } else G.menu = null; ev('sfx', { name: 'chime' }); return;
    case 'shop': G.menu = { k: 'shop', tab: 0 }; return;
    case 'sell': G.menu = { k: 'sell', who: G.menu && G.menu.d ? G.menu.d.npc : 'hollis' }; return;
    case 'trade': G.menu = { k: 'trade' }; return;
    case 'side': G.side[arg] = 'active'; G.menu = { k: 'dialog', d: Object.assign({}, G.menu.d, { text: 'New task: ' + SIDE_QUESTS[arg].t, opts: [{ label: 'You got it!', a: 'close' }] }) }; toast('📜 New quest: ' + SIDE_QUESTS[arg].title, '#ffe7a0'); return;
    case 'sidedone': finishSide(arg); return;
    case 'sleep': G.menu = null; G.sleepFade = 1.6; G.sleepTo = arg; return;
  }
}
function checkSide(id) {
  switch (SIDE_QUESTS[id].check) {
    case 'skip5': return G.stats.skipBest >= 5; case 'haveRainbow': return countItem('rainbow') > 0; case 'haveSunglasses': return countItem('sunglasses') > 0;
    case 'haveWatermelon': return countItem('watermelon') > 0; case 'acorns6': return Object.keys(G.acorns).length >= 6; case 'acorns12': return Object.keys(G.acorns).length >= 12;
    case 'species10': return Object.keys(G.journal).length >= 10; case 'haveGrilled': return countItem('grilledfish') > 0;
  }
  return false;
}
function giveReward(r) {
  const out = [];
  if (r.coins) { G.coins += r.coins; out.push(r.coins + ' coins'); ev('sfx', { name: 'coin' }); }
  if (r.item) { if (!addItem({ id: r.item }, true)) G.chest.push({ id: r.item }); out.push(ITEMS[r.item].name); }
  if (r.gear) { G.owned[r.gear] = true; out.push(SHOP_BY_ID[r.gear].name); }
  if (r.decor) { G.owned.decor[r.decor] = true; out.push(SHOP_BY_ID[r.decor].name); }
  if (r.rod) { G.owned.rod = Math.max(G.owned.rod, r.rod); out.push(RODS[r.rod].name); }
  return out.join(' + ');
}
function finishSide(id) {
  const q = SIDE_QUESTS[id]; if (q.take) takeItem(q.take); G.side[id] = 'done';
  const got = giveReward(q.reward); G.menu = { k: 'dialog', d: Object.assign({}, G.menu.d, { text: 'Thank you so much, Jax! Here, take this: ' + got, opts: [{ label: 'Awesome!', a: 'close' }] }) };
  toast('✅ ' + q.title + ' complete! +' + got, '#bff59a', 4); ev('sfx', { name: 'fanfare' }); G.p.celebrateT = 1.6; save();
}

// ---------------------------------------------------------------- economy
export function owns(id) {
  const s = SHOP_BY_ID[id]; if (!s) return false;
  if (s.kind === 'rod') return G.owned.rod >= s.tier; if (s.kind === 'decor') return !!G.owned.decor[id];
  if (s.kind === 'pack') return G.slots >= s.slots; if (s.kind === 'bait') return false; return !!G.owned[id];
}
export function canBuy(id) { const s = SHOP_BY_ID[id]; return s && !owns(id) && G.coins >= s.price && !(s.kind === 'rod' && G.owned.rod < 1); }
export function buy(id) {
  const s = SHOP_BY_ID[id]; if (!s) return false;
  if (owns(id)) { toast('You already have that!', '#ffb04a'); return false; }
  if (s.kind === 'rod' && G.owned.rod < 1) { toast('Talk to Old Gus on the dock first - he has a starter rod for you.', '#ffb04a'); return false; }
  if (G.coins < s.price) { toast('Not enough coins.', '#ff8a6a'); ev('sfx', { name: 'error' }); return false; }
  G.coins -= s.price;
  if (s.kind === 'rod') G.owned.rod = s.tier; else if (s.kind === 'bait') G.bait += s.n; else if (s.kind === 'lure') { G.owned[id] = true; G.equip.lure = id; }
  else if (s.kind === 'disguise') { G.owned[id] = true; G.equip.disguise = id; } else if (s.kind === 'pack') G.slots = s.slots; else if (s.kind === 'decor') G.owned.decor[id] = true; else G.owned[id] = true;
  toast('Bought ' + s.icon + ' ' + s.name + '!', '#bff59a'); ev('sfx', { name: 'coin' }); save(); return true;
}
export function sellPrice(it, who = 'hollis') {
  const base = itemValue(it); const cat = itemCat(it);
  if (cat === 'quest' || (ITEMS[it.id] && ITEMS[it.id].keep)) return 0;
  if (who === 'willa') { const r = G.willaRates; let m = r[cat] || 1; const key = it.fish ? it.fish.sp : it.id; if (key === r.hot) m *= 2.5; return Math.max(1, Math.round(base * m)); }
  return Math.max(1, Math.round(base * (cat === 'collectible' ? 0.8 : 1)));
}
export function sell(idx, who = 'hollis') {
  const it = G.inv[idx]; if (!it) return 0; const pr = sellPrice(it, who); if (!pr) { toast('You can\'t sell that - it\'s special!', '#ffb04a'); return 0; }
  G.inv.splice(idx, 1); G.coins += pr; G.stats.sold++; ev('sfx', { name: 'coin' }); toast(`Sold ${itemName(it)} for ${pr} coins`, '#ffe066', 2); return pr;
}
function matches(it, g) { if (g.id) return it.id === g.id || (it.fish && it.fish.sp === g.id); if (itemCat(it) !== g.cat) return false; if (g.rare && (!it.fish || FISH_BY_ID[it.fish.sp].r < g.rare)) return false; return true; }
function tradePick(o) { const used = new Set(); const picks = []; for (const g of o.give) for (let k = 0; k < g.n; k++) { const i = G.inv.findIndex((it, j) => !used.has(j) && matches(it, g)); if (i < 0) return null; used.add(i); picks.push(i); } return picks; }
export function canTrade(k) { const o = G.trades[k]; if (!o || o.used || (o.need && !o.need())) return false; return !!tradePick(o); }
export function tradeGiveLabel(o) { return o.give.map(g => `${g.n}x ${g.id ? (ITEMS[g.id] ? ITEMS[g.id].name : FISH_BY_ID[g.id].name) : g.rare ? 'Rare Fish' : { fish: 'Any Fish', food: 'Any Snack', collectible: 'Any Treasure' }[g.cat]}`).join(' + '); }
export function tradeGetLabel(o) { const g = o.get; return g.coins ? g.coins + ' coins' : g.bait ? g.bait + ' worms' : g.item ? ITEMS[g.item].name : o.label; }
export function trade(k) {
  const o = G.trades[k]; if (!o || o.used) return false; if (o.need && !o.need()) { toast('You already have that!', '#ffb04a'); return false; }
  const picks = tradePick(o); if (!picks) { toast('You don\'t have the right things for that trade.', '#ff8a6a'); ev('sfx', { name: 'error' }); return false; }
  picks.sort((a, b) => b - a).forEach(i => G.inv.splice(i, 1)); const g = o.get;
  if (g.coins) G.coins += g.coins; if (g.bait) G.bait += g.bait; if (g.item) addItem({ id: g.item }, true);
  if (g.gear) { G.owned[g.gear] = true; const s = SHOP_BY_ID[g.gear]; if (s.kind === 'disguise') G.equip.disguise = g.gear; if (s.kind === 'lure') G.equip.lure = g.gear; }
  if (g.decor) G.owned.decor[g.decor] = true;
  o.used = true; G.stats.trades++; ev('sfx', { name: 'coin' }); toast('Traded for ' + tradeGetLabel(o) + '!', '#bff59a'); save(); return true;
}
export function canCook(r) { const used = new Set(); for (const g of r.need) { const i = G.inv.findIndex((it, j) => !used.has(j) && matches(it, g)); if (i < 0) return false; used.add(i); } return true; }
export function cook(rid) {
  const r = RECIPES.find(r => r.id === rid); if (!r || !canCook(r)) { toast('Missing ingredients.', '#ff8a6a'); ev('sfx', { name: 'error' }); return false; }
  const used = []; let val = 0; for (const g of r.need) { const i = G.inv.findIndex((it, j) => !used.includes(j) && matches(it, g)); used.push(i); if (rid === 'grilledfish') val = Math.max(10, Math.round(itemValue(G.inv[i]) * 1.5)); }
  used.sort((a, b) => b - a).forEach(i => G.inv.splice(i, 1));
  G.inv.push(rid === 'grilledfish' ? { id: rid, val } : { id: rid }); G.stats.cooked++; G.cookCount = G.cookCount || {}; G.cookCount[rid] = (G.cookCount[rid] || 0) + 1;
  ev('sfx', { name: 'sizzle' }); toast('Cooked ' + r.name + '!', '#ffcf8a'); return true;
}
export function chestPut(i) { const it = G.inv[i]; if (!it) return; if (G.chest.length >= 40) { toast('Chest is full!', '#ffb04a'); return; } G.inv.splice(i, 1); G.chest.push(it); ev('sfx', { name: 'grab' }); }
export function chestTake(i) { const it = G.chest[i]; if (!it) return; if (addItem(it)) { G.chest.splice(i, 1); ev('sfx', { name: 'grab' }); } }
export function drop(i) { G.inv.splice(i, 1); }
export function equip(id) {
  const s = SHOP_BY_ID[id]; if (!s || !G.owned[id]) return;
  if (s.kind === 'disguise') G.equip.disguise = G.equip.disguise === id ? null : id; if (s.kind === 'lure') G.equip.lure = G.equip.lure === id ? null : id; ev('sfx', { name: 'click' });
}
export function toggleBike() {
  const p = G.p; if (!G.owned.bike) { toast('You need a bike - Mr. Hollis sells them.', '#ffb04a'); return; }
  if (p.canoe || p.swim || p.hidden || G.fish) return; p.bike = !p.bike; p.crouch = false; ev('sfx', { name: p.bike ? 'bell' : 'click' });
}

// ---------------------------------------------------------------- fishing
function waterAhead(x, z, rot, maxR = 7) {
  for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, 3.14]) for (const r of [2.2, 3.2, 4.5, maxR]) {
    const a = rot + da; const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
    if (W.waterRegion(bx, bz) && W.H(bx, bz) < -0.3 && !W.deckAt(bx, bz)) return { a, r };
  }
  return null;
}
export function canFish() { const p = G.p; if (G.owned.rod < 1 || p.hidden || p.bike || p.swim || G.caught || G.party || G.skip) return false; return !!waterAhead(p.x, p.z, p.rot); }
export function startFishing() {
  const p = G.p;
  if (G.owned.rod < 1) { toast(G.flags.metGus ? 'No rod!' : 'You need a fishing rod. Old Gus on the dock might help!', '#ffb04a'); return false; }
  if (p.bike) { toast('Hop off the bike first (R).', '#ffb04a'); return false; }
  const w = waterAhead(p.x, p.z, p.rot); if (!w || p.swim || p.hidden) { toast('Walk to the water\'s edge and face the water to fish.', '#ffb04a'); return false; }
  p.rot = w.a; p.crouch = false; p.vx = p.vz = 0;
  G.fish = { st: 'aim', t: 0, power: 0, pdir: 1, tension: 0, prog: 0, slack: 0, over: 0, surge: 0, surgeT: 1, bx: 0, bz: 0, region: null, sp: null, nib: 0 };
  ev('sfx', { name: 'click' }); return true;
}
function pickSpecies(region) {
  const tier = G.owned.rod, tod = timeOfDay(), rain = G.weather.kind === 'rain', lure = G.equip.lure;
  const pool = []; let tot = 0;
  for (const f of FISH) {
    if (!f.loc.includes(region)) continue; if (f.rod > tier) continue;
    if (f.time === 'day' && !(tod === 'day' || tod === 'dawn')) continue;
    if (f.time === 'night' && tod !== 'night') continue;
    if (f.time === 'dusk' && tod === 'day') continue;
    if (f.rain && !rain) continue; if (f.lure && lure !== f.lure) continue;
    let w = f.w; if (f.junk) w *= tier >= 3 ? 0.5 : 1;
    if (f.r >= 2 && tier >= 3) w *= 1.25; if (f.r >= 3) w *= 1 + 0.15 * (tier - f.rod);
    if (lure === 'spinner' && /trout|bass/.test(f.id)) w *= 1.5; if (lure === 'glow' && (region === 'deep' || tod === 'night')) w *= f.r >= 2 ? 1.6 : 1;
    if (rain && f.r >= 2) w *= 1.4; if (f.id === 'silverjaw' && G.quest.ch === 2 && G.quest.step === 3) w *= 2.5;
    pool.push([f, w]); tot += w;
  }
  if (G.side.dev === 'active' && !countItem('sunglasses') && region === 'lake' && dist(G.fish.bx, G.fish.bz, W.LOC.dockEnd.x, W.LOC.dockEnd.z) < 14 && rng() < 0.4) return 'sunglasses';
  let r = rng() * tot; for (const [f, w] of pool) { r -= w; if (r <= 0) return f.id; } return pool.length ? pool[0][0].id : 'boot';
}
function landFish() {
  const F = G.fish; const p = G.p; const sp = F.sp;
  if (sp === 'sunglasses') { addItem({ id: 'sunglasses' }, true); toast('🕶️ You fished up Dev\'s sunglasses!', '#bff59a'); G.fish = { st: 'caught', t: 0, sp, size: 0, junk: true }; ev('sfx', { name: 'splash', big: 0.6 }); return; }
  const f = FISH_BY_ID[sp]; const [a, b] = f.size || [10, 20]; const size = Math.round((a + (b - a) * Math.pow(rng(), 1.6)) * 10) / 10;
  const it = f.junk ? { id: sp } : { id: 'fish', fish: { sp, size } };
  const isNew = !f.junk && !G.journal[sp];
  if (!f.junk) { const j = G.journal[sp] || { n: 0, best: 0 }; j.n++; j.best = Math.max(j.best, size); G.journal[sp] = j; G.stats.fishCaught++; }
  const stored = addItem(it, true); if (!stored && f.r >= 3) G.chest.push(it);
  G.fish = { st: 'caught', t: 0, sp, size, isNew, stored: stored || f.r >= 3, junk: !!f.junk };
  ev('sfx', { name: 'splash', big: 0.8 }); ev('splash', { x: p.x + Math.cos(p.rot) * 1.2, z: p.z + Math.sin(p.rot) * 1.2, big: 0.6 });
  ev('sfx', { name: f.r >= 4 ? 'fanfare' : 'catch' }); p.celebrateT = f.junk ? 0 : 1.4;
  if (f.r >= 4) G.banner = { text: 'LEGENDARY CATCH!', sub: f.name + ' - ' + size + ' cm', t: 0, dur: 4.5, col: '#ffc83a' };
  if (!stored) toast(f.r >= 3 ? 'Backpack full - sent to your hideout chest!' : 'Backpack full! You let it go.', '#ffb04a', 3);
}
function updateFishing(dt, inp) {
  const F = G.fish; if (!F) return; const p = G.p; F.t += dt; const tier = G.owned.rod;
  const press = inp.fishDown || inp.action, held = inp.fishHeld || inp.actionHeld, up = inp.fishUp || inp.actionUp;
  if (inp.cancel && F.st !== 'caught') { G.fish = null; return; }
  switch (F.st) {
    case 'aim':
      if (held || F.charging) { F.charging = true; F.power += F.pdir * dt * 1.1; if (F.power > 1) { F.power = 1; F.pdir = -1; } if (F.power < 0) { F.power = 0; F.pdir = 1; } }
      if (F.charging && (up || !held)) {
        const range = 3 + F.power * (4 + tier * 1.5); let r = range, bx, bz;
        for (; r > 1.5; r -= 0.5) { bx = p.x + Math.cos(p.rot) * r; bz = p.z + Math.sin(p.rot) * r; if (W.waterRegion(bx, bz) && W.H(bx, bz) < -0.25 && !W.deckAt(bx, bz)) break; }
        if (r <= 1.5) { toast('Not enough water there - try facing the lake.', '#ffb04a'); G.fish = null; return; }
        F.bx = bx; F.bz = bz; F.region = W.waterRegion(bx, bz); F.st = 'cast'; F.t = 0; F.r = r;
        F.bait = G.bait > 0; if (F.bait) G.bait--;
        const tod = timeOfDay(); let wait = 3 + rng() * 6; if (F.bait) wait *= 0.55; if (G.equip.lure) wait *= 0.75; if (tod === 'dawn' || tod === 'dusk') wait *= 0.8; if (G.weather.kind === 'rain') wait *= 0.85;
        F.wait = wait; F.nib = 1 + rng() * 1.2; ev('sfx', { name: 'cast' });
      }
      break;
    case 'cast': if (F.t > 0.75) { F.st = 'wait'; F.t = 0; ev('splash', { x: F.bx, z: F.bz, big: 0.15 }); ev('sfx', { name: 'plop' }); } break;
    case 'wait':
      F.nib -= dt; if (F.nib <= 0 && F.t < F.wait - 0.6) { F.nib = 0.8 + rng() * 1.5; F.nibble = 0.25; ev('ripple', { x: F.bx, z: F.bz }); ev('sfx', { name: 'nibble' }); }
      if (F.nibble > 0) F.nibble -= dt;
      if (press && F.t > 0.3) { toast('Too early! Wait for the big tug.', '#ffb04a', 2); G.fish = null; ev('sfx', { name: 'reelin' }); return; }
      if (F.t >= F.wait || G.forceBite) { G.forceBite = false; F.st = 'bite'; F.t = 0; F.win = 0.75 + 0.1 * tier + (F.bait ? 0.1 : 0); F.sp = G.forceSpecies || pickSpecies(F.region); G.forceSpecies = null; ev('sfx', { name: 'bite' }); ev('splash', { x: F.bx, z: F.bz, big: 0.35 }); }
      break;
    case 'bite':
      if (press) { F.st = 'reel'; F.t = 0; F.tension = 0.35; F.prog = 0.12; const f = FISH_BY_ID[F.sp]; F.str = f ? f.str : 1; ev('sfx', { name: 'hook' }); }
      else if (F.t > F.win) { toast('It got away! Tap faster when the bobber dips.', '#ff8a6a', 2.5); G.fish = null; ev('sfx', { name: 'miss' }); }
      break;
    case 'reel': {
      const k = 1 / (1 + 0.22 * (tier - 1)); F.surgeT -= dt;
      if (F.surgeT <= 0) { F.surge = (0.5 + rng() * 0.7) * F.str * 0.35; F.surgeT = 1.2 + rng() * 2.2 / F.str; F.surging = 0.6 + rng() * 0.6; }
      if (F.surging > 0) F.surging -= dt;
      const pull = F.surging > 0 ? F.surge : 0;
      if (held) { F.tension += (0.42 + 0.1 * F.str + pull * 2.2) * k * dt; F.prog += (0.3 + 0.06 * tier) / (0.7 + F.str * 0.3) * dt * (F.surging > 0 ? 0.35 : 1); F.slack = 0; if (F.t % 0.12 < dt) ev('sfx', { name: 'reel' }); }
      else { F.tension -= (0.75 - pull * 0.6) * dt; F.prog -= 0.02 * dt * F.str; F.slack += F.tension < 0.12 ? dt : 0; }
      F.tension = clamp(F.tension, 0, 1.3); F.prog = clamp(F.prog, 0, 1);
      if (F.tension > 1) { F.over += dt; if (F.over > 0.32) { toast('Snap! The line broke. Let go when the line turns red!', '#ff8a6a', 3); G.fish = null; ev('sfx', { name: 'snap' }); return; } } else F.over = Math.max(0, F.over - dt);
      if (F.slack > 2.2) { toast('Too much slack - it swam off!', '#ff8a6a', 2.5); G.fish = null; ev('sfx', { name: 'miss' }); return; }
      if (F.prog >= 1) landFish();
      break;
    }
    case 'caught': if (F.t > 2.8 || (F.t > 0.6 && press)) G.fish = null; break;
  }
}

// ---------------------------------------------------------------- stone skipping
export function startSkip() { const p = G.p; const s = W.SKIP_SPOTS.reduce((a, b) => dist2(a.x, a.z, p.x, p.z) < dist2(b.x, b.z, p.x, p.z) ? a : b); p.rot = s.dir; G.skip = { st: 'aim', t: 0, needle: 0, dir: 1, hops: 0, spot: s }; ev('sfx', { name: 'click' }); }
function updateSkip(dt, inp) {
  const S = G.skip; if (!S) return; S.t += dt; const p = G.p;
  if (inp.cancel) { G.skip = null; return; }
  if (S.st === 'aim') {
    S.needle += S.dir * dt * 1.25; if (S.needle > 1) { S.needle = 1; S.dir = -1; } if (S.needle < 0) { S.needle = 0; S.dir = 1; }
    if ((inp.action || inp.interact || inp.fishDown) && S.t > 0.25) { const q = clamp(1 - Math.abs(S.needle - 0.72) * 3.2, 0, 1); S.hops = Math.max(1, Math.round(1 + q * q * 8 + rng() * 0.8)); S.st = 'fly'; S.t = 0; S.q = q; S.hop = 0; p.throwT = 0.5; ev('sfx', { name: 'throw' }); }
  } else if (S.st === 'fly') {
    const next = 0.45 + S.hop * 0.32;
    if (S.t > next && S.hop < S.hops) { S.hop++; const d = 2 + S.hop * 2.3 - S.hop * S.hop * 0.06; ev('splash', { x: p.x + Math.cos(p.rot) * d, z: p.z + Math.sin(p.rot) * d, big: 0.12 }); ev('sfx', { name: 'skip', n: S.hop }); }
    if (S.t > next + 0.6 && S.hop >= S.hops) { S.st = 'done'; S.t = 0; G.stats.skipBest = Math.max(G.stats.skipBest, S.hops); toast(S.hops >= 7 ? `WOW! ${S.hops} skips!` : S.hops >= 5 ? `${S.hops} skips! Nice throw!` : `${S.hops} skip${S.hops > 1 ? 's' : ''}.`, S.hops >= 5 ? '#bff59a' : '#fff', 2.5); if (S.hops >= 5) p.celebrateT = 1.2; }
  } else if (S.st === 'done' && S.t > 0.8) G.skip = null;
}

// ---------------------------------------------------------------- party (finale)
function startParty() {
  const fp = W.LOC.firePit; const guests = ['gus', 'willa', 'hollis', 'lily', 'mike', 'maya'];
  for (let i = 0; i < 3; i++) takeItem('smores'); for (let i = 0; i < 2; i++) takeItem('grilledfish');
  const seats = {}; guests.forEach((id, i) => { const a = i / guests.length * Math.PI * 2 + 0.4; const n = npc(id); seats[id] = { x: n.x, z: n.z, rot: n.rot, anim: n.anim, y: n.y, visible: n.visible }; n.x = fp.x + Math.cos(a) * 2.6; n.z = fp.z + Math.sin(a) * 2.6; n.y = W.ground(n.x, n.z); n.rot = a + Math.PI; n.visible = true; n.anim = i % 2 ? 'cheer' : 'sit'; n.partyGuest = true; });
  const p = G.p; p.x = fp.x + 2.8; p.z = fp.z - 1; p.y = W.ground(p.x, p.z); p.rot = Math.atan2(fp.z - p.z, fp.x - p.x);
  G.party = { t: 0, seats }; G.flags.party = true; G.owned.decor.firepit = true; ev('sfx', { name: 'fanfare' }); ev('teleport');
}
function updateParty(dt) {
  const P = G.party; P.t += dt; G.p.anim = P.t % 6 < 3 ? 'celebrate' : 'idle';
  for (const id of Object.keys(P.seats)) { const n = npc(id); n.animT += dt; if (P.t > 3) n.anim = (Math.floor(P.t / 2.5) + id.length) % 3 === 0 ? 'cheer' : 'sit'; if (P.t > 1 && P.t < 2) say(n, ['Best party ever!', 'Yum, s\'mores!', 'Way to go, Jax!', 'Look at the stars!', '🎵', 'Hooray!'][Object.keys(P.seats).indexOf(id)], 4); }
  if (P.t > 6 && !P.ended) P.ended = G.banner = { text: 'THE END', sub: 'Thanks for playing! The park is still yours to explore.', t: 0, dur: 7, col: '#ffd84a' };
  if (P.t > 15) { for (const [id, s] of Object.entries(P.seats)) { const n = npc(id); Object.assign(n, s); n.partyGuest = false; n.say = null; } G.party = null; save(); }
}

// ---------------------------------------------------------------- quests
const CHECKS = {
  atSign: () => dist(G.p.x, G.p.z, W.LOC.trailSign.x, W.LOC.trailSign.z) < 4.5,
  grabbed1: () => G.stats.grabs >= 1, metGus: () => !!G.flags.metGus, caught1: () => G.stats.fishCaught >= 1, sold1: () => G.stats.sold >= 1, hid1: () => !!G.p.hidden,
  traded1: () => G.stats.trades >= 1, hasBike: () => G.owned.bike, hasCanoe: () => G.owned.canoe,
  canoeIsland: () => dist(G.p.x, G.p.z, W.ISLAND.x, W.ISLAND.z) < W.ISLAND.r + 4,
  gusLegend: () => !!G.flags.gusLegend, rod3: () => G.owned.rod >= 3, hasGlow: () => !!G.owned.glow, silverjaw: () => !!G.journal.silverjaw, showedGus: () => !!G.flags.showedGus,
  partyDecor: () => !!(G.owned.decor.firepit && G.owned.decor.lights), partyFood: () => countItem('smores') >= 3 && countItem('grilledfish') >= 2,
  invited: () => !!(G.flags.inv_gus && G.flags.inv_willa && G.flags.inv_hollis), party: () => !!G.flags.party,
};
export function questStep() { return curStep(); }
function updateQuests() {
  if (G.quest.done) return; const c = CHAPTERS[G.quest.ch]; const s = c.steps[G.quest.step];
  if (!CHECKS[s.check]()) return;
  ev('sfx', { name: 'quest' }); G.quest.step++;
  if (G.quest.step >= c.steps.length) {
    const got = giveReward(c.reward); G.banner = { text: c.title.split(':')[0] + ' complete!', sub: c.title.split(':')[1].trim() + '  +' + got, t: 0, dur: 4, col: '#ffe066' }; G.p.celebrateT = 1.6; ev('sfx', { name: 'fanfare' });
    G.quest.ch++; G.quest.step = 0; if (G.quest.ch >= CHAPTERS.length) { G.quest.done = true; G.quest.ch = CHAPTERS.length - 1; G.quest.step = CHAPTERS[G.quest.ch].steps.length - 1; }
    else if (G.quest.ch === 2) toast('Deputy Pine has joined the patrol. Stay sharp!', '#ffb04a', 4);
  } else toast('✔ ' + s.t, '#bff59a', 2.6);
  const ns = curStep();
  if (ns && ns.check === 'hid1') { const r = npc('ranger'); r.x = G.p.x + 16; r.z = G.p.z + 6; [r.x, r.z] = W.collide(r.x, r.z, 0.4); r.y = W.ground(r.x, r.z); r.state = 'investigate'; r.tx = G.p.x; r.tz = G.p.z; r.alert = '?'; r.aware = 0.4; G.banner = { text: 'Uh oh! Ranger Bramble!', sub: 'Hide in a big bush or a trash bin before he spots you', t: 0, dur: 3.5, col: '#ffb04a' }; ev('sfx', { name: 'whistle' }); }
  save();
}
export function questTarget() {
  const s = curStep(); if (!s) return null; const p = G.p; const N = id => { const n = npc(id); return { x: n.x, z: n.z, label: n.name }; };
  switch (s.target) {
    case 'trailSign': return { ...W.LOC.trailSign, label: 'Trail sign' };
    case 'beachBasket': { const b = W.STASHES.find(s => s.id === 'beachbasket0'); return { x: b.x, z: b.z, label: 'Picnic basket' }; }
    case 'dockEnd': return { ...W.LOC.dockEnd, label: 'Dock' };
    case 'nearestHide': { let best = null, bd = 1e9; for (const h of W.HIDES) { if (h.kind === 'tent') continue; const d = dist2(h.x, h.z, p.x, p.z); if (d < bd) { bd = d; best = h; } } return best && { x: best.x, z: best.z, label: 'Hiding spot' }; }
    case 'island': return { x: W.ISLAND.x, z: W.ISLAND.z, label: 'Acorn Island' };
    case 'deep': return { x: W.LAKE.x + 4, z: W.LAKE.z - 2, label: 'Deep lake' };
    case 'firepit': return { ...W.LOC.firePit, label: 'Hideout fire pit' };
    case 'invite': { for (const id of ['gus', 'willa', 'hollis']) if (!G.flags['inv_' + id]) return N(id); return null; }
    default: return npc(s.target) ? N(s.target) : null;
  }
}

// ---------------------------------------------------------------- player
function updatePlayer(dt, inp) {
  const p = G.p; let mx = inp.mx || 0, mz = inp.mz || 0; const mag = Math.min(1, Math.hypot(mx, mz)); if (mag > 1e-3) { mx /= Math.max(1, Math.hypot(mx, mz)); mz /= Math.max(1, Math.hypot(mx, mz)); }
  p.animT += dt; if (p.grabT > 0) p.grabT -= dt; if (p.celebrateT > 0) p.celebrateT -= dt; if (p.throwT > 0) p.throwT -= dt;
  if (inp.crouchToggle && !p.bike && !p.canoe) p.crouch = !p.crouch;
  p.crouchNow = (p.crouch || inp.crouchHeld) && !p.bike && !p.swim && !p.canoe && !p.hidden;
  if (G.fish && mag > 0.35 && G.fish.st !== 'caught') { G.fish = null; }
  if (G.skip && mag > 0.35 && G.skip.st === 'aim') G.skip = null;
  if (p.hidden) { p.anim = 'hidden'; p.spd = 0; p.hiddenT = (p.hiddenT || 0) + dt; if (mag > 0.6 && p.hiddenT > 0.5) { interact({ k: 'unhide' }); p.hiddenT = 0; } return; } else p.hiddenT = 0;
  if (G.fish || G.skip) { p.spd = 0; p.vx = p.vz = 0; p.anim = G.fish ? 'fish' : 'throw'; p.y = W.ground(p.x, p.z); return; }
  if (p.canoe) {
    const C = G.canoe; const fast = inp.run; const sp = fast ? SPEED.canoeFast : SPEED.canoe;
    if (mag > 0.1) { const want = Math.atan2(mz, mx); C.rot = angLerp(C.rot, want, clamp(dt * 2.2, 0, 1)); const al = Math.max(0, Math.cos(wrapAng(want - C.rot))); C.vx += Math.cos(C.rot) * sp * mag * al * dt * 1.6; C.vz += Math.sin(C.rot) * sp * mag * al * dt * 1.6; }
    const drag = Math.exp(-dt * 1.2); C.vx *= drag; C.vz *= drag; const v = Math.hypot(C.vx, C.vz); if (v > sp) { C.vx *= sp / v; C.vz *= sp / v; }
    let nx = C.x + C.vx * dt, nz = C.z + C.vz * dt;
    const okW = (x, z) => W.H(x, z) < -0.25 && !W.deckAt(x, z) && Math.abs(x) < W.HALF && Math.abs(z) < W.HALF;
    const fx = nx + Math.cos(C.rot) * 1.6, fz = nz + Math.sin(C.rot) * 1.6;
    if (!okW(nx, nz) || !okW(fx, fz)) { if (okW(nx, C.z) && okW(nx + Math.cos(C.rot) * 1.6, C.z)) nz = C.z; else if (okW(C.x, nz) && okW(C.x, nz + Math.sin(C.rot) * 1.6)) nx = C.x; else { nx = C.x; nz = C.z; } C.vx *= 0.3; C.vz *= 0.3; }
    C.x = nx; C.z = nz; p.x = nx; p.z = nz; p.y = 0; p.rot = C.rot; p.spd = Math.hypot(C.vx, C.vz); p.anim = 'canoe'; p.swim = false;
    p.stepAcc += p.spd * dt; if (p.stepAcc > 2.4 && mag > 0.1) { p.stepAcc = 0; ev('sfx', { name: 'paddle' }); ev('ripple', { x: p.x, z: p.z }); }
    return;
  }
  const depth = -W.H(p.x, p.z); const deck = W.deckAt(p.x, p.z);
  const swim = depth > 0.6 && !deck && p.y < 0.3; if (swim && !p.swim) { ev('splash', { x: p.x, z: p.z, big: 0.5 }); ev('sfx', { name: 'splash', big: 0.5 }); p.bike = false; } p.swim = swim;
  p.running = !!inp.run && !p.crouchNow && !p.swim && mag > 0.2;
  const sp = p.swim ? SPEED.swim : p.bike ? (inp.run ? SPEED.bikeFast : SPEED.bike) : p.crouchNow ? SPEED.sneak : p.running ? SPEED.run : SPEED.walk;
  const tvx = mx * sp, tvz = mz * sp; const acc = p.bike ? 4 : p.swim ? 4 : 12;
  p.vx = lerp(p.vx, tvx, clamp(acc * dt, 0, 1)); p.vz = lerp(p.vz, tvz, clamp(acc * dt, 0, 1));
  let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
  if (p.bike && -W.H(nx, nz) > 0.4 && !W.deckAt(nx, nz)) { nx = p.x; nz = p.z; p.vx *= 0.2; p.vz *= 0.2; }
  [nx, nz] = W.collide(nx, nz, p.bike ? 0.45 : 0.28, p.y - W.H(p.x, p.z));
  nx = clamp(nx, -W.HALF + 2, W.HALF - 2); nz = clamp(nz, -W.HALF + 2, W.HALF - 2);
  const moved = Math.hypot(nx - p.x, nz - p.z); p.x = nx; p.z = nz; p.spd = moved / dt;
  if (mag > 0.1) p.rot = angLerp(p.rot, Math.atan2(mz, mx), clamp(dt * (p.bike ? 5 : 12), 0, 1));
  const gy = p.swim ? -0.82 : W.ground(p.x, p.z);
  if (inp.jump && p.onGround && !p.swim && !p.bike) { p.vy = 4.6; p.onGround = false; p.jumpT = 0; ev('sfx', { name: 'jump' }); }
  if (!p.onGround) { p.vy -= 14 * dt; p.y += p.vy * dt; p.jumpT += dt; if (p.y <= gy) { p.y = gy; p.onGround = true; p.vy = 0; ev('dust', { x: p.x, z: p.z, n: 6 }); ev('sfx', { name: 'land', surf: W.surfaceAt(p.x, p.z) }); } }
  else p.y = p.swim ? lerp(p.y, gy, clamp(dt * 6, 0, 1)) : (Math.abs(gy - p.y) < 0.7 || gy > p.y ? gy : (p.onGround = false, p.y));
  const stride = p.swim ? 1.2 : p.bike ? 3.2 : p.running ? 1.05 : p.crouchNow ? 0.6 : 0.72;
  p.stepAcc += p.spd * dt; G.stats.steps += p.spd * dt;
  if (p.stepAcc > stride && p.onGround) { p.stepAcc = 0; const surf = p.swim ? 'water' : W.surfaceAt(p.x, p.z);
    if (p.swim) { ev('sfx', { name: 'swim' }); ev('ripple', { x: p.x, z: p.z }); }
    else if (!p.bike) { ev('sfx', { name: 'step', surf, soft: p.crouchNow }); ev('foot', { x: p.x, z: p.z, rot: p.rot, surf, side: (p.side = -(p.side || 1)) }); if (p.running && (surf === 'dirt' || surf === 'sand' || surf === 'road')) ev('dust', { x: p.x, z: p.z, n: 2 }); if (-W.H(p.x, p.z) > 0.05 && !W.deckAt(p.x, p.z)) ev('splash', { x: p.x, z: p.z, big: 0.12 }); }
    else if (surf === 'dirt' || surf === 'sand') ev('dust', { x: p.x, z: p.z, n: 2 });
  }
  p.anim = p.celebrateT > 0 && p.spd < 0.5 ? 'celebrate' : p.grabT > 0 ? 'grab' : p.throwT > 0 ? 'throw' : p.swim ? 'swim' : p.bike ? 'bike' : !p.onGround ? 'jump' : p.crouchNow ? (p.spd > 0.3 ? 'sneak' : 'crouch') : p.spd > 4.4 ? 'run' : p.spd > 0.3 ? 'walk' : 'idle';
}

// ---------------------------------------------------------------- main update
export function update(dt, inp = {}) {
  G.t += dt;
  for (const t of G.toasts) t.t += dt; G.toasts = G.toasts.filter(t => t.t < t.dur);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
  if (G.sleepFade > 0) { const before = G.sleepFade; G.sleepFade -= dt; if (before > 0.8 && G.sleepFade <= 0.8) { let dh = G.sleepTo - G.clock; if (dh <= 0.2) dh += 24; advanceClock(dh); G.p.celebrateT = 0; for (const n of G.npcs) if (n.kind === 'ranger') { n.state = 'patrol'; n.aware = 0; n.alert = null; } save(); toast('You feel rested! Game saved.', '#bfe6ff'); } return; }
  if (G.menu || G.paused) return;
  if (G.caught) { G.caught.t += dt; const by = npc(G.caught.by); if (by) { by.rot = Math.atan2(G.p.z - by.z, G.p.x - by.x); by.anim = 'point'; } G.p.anim = 'caught'; G.p.animT += dt; if (G.caught.t > 2.4) finishCaught(); for (const n of G.npcs) { n.animT += dt; if (n.sayT > 0) { n.sayT -= dt; if (n.sayT <= 0) n.say = null; } } return; }
  advanceClock(dt / HOUR_SECS);
  const W8 = G.weather; W8.rain = lerp(W8.rain, W8.kind === 'rain' ? 1 : 0, clamp(dt * 0.25, 0, 1)); W8.cloud = lerp(W8.cloud, W8.kind === 'clear' ? 0.25 : W8.kind === 'cloudy' ? 0.7 : 0.95, clamp(dt * 0.2, 0, 1)); W8.wind = lerp(W8.wind, W8.kind === 'rain' ? 1 : 0.45, dt * 0.2);
  if (G.party) { updateParty(dt); return; }
  if (inp.bike) toggleBike();
  if (G.fish) updateFishing(dt, inp);
  else if (G.skip) updateSkip(dt, inp);
  else {
    const ctx = getCtx();
    if (inp.action) { if (ctx) interact(ctx); else if (!G.p.canoe) inp.jump = true; }
    else if (inp.interact && ctx) interact(ctx);
    if (inp.fishDown && !G.fish && !G.skip && !G.menu) { if (startFishing()) { G.fish.charging = !!inp.fishHeld || true; } }
  }
  if (!G.menu) updatePlayer(dt, inp);
  updateNPCs(dt); updateQuests();
  G.autosaveT += dt; if (G.autosaveT > 30) { G.autosaveT = 0; save(); }
}

// ---------------------------------------------------------------- save / load
const SAVE_FIELDS = ['clock', 'day', 'weather', 'coins', 'inv', 'chest', 'slots', 'owned', 'equip', 'bait', 'journal', 'quest', 'side', 'flags', 'acorns', 'finds', 'berries', 'stats', 'canoe', 'cookCount'];
let store = null; try { store = globalThis.localStorage || null; } catch (e) { store = null; }
export function save() {
  if (!store || !G) return false; const o = { v: 1, p: { x: G.p.x, z: G.p.z, rot: G.p.rot, canoe: G.p.canoe, bike: G.p.bike } };
  for (const k of SAVE_FIELDS) o[k] = G[k];
  try { store.setItem(SAVE_KEY, JSON.stringify(o)); G.lastSaveT = G.t; return true; } catch (e) { return false; }
}
export function hasSave() { try { return !!(store && store.getItem(SAVE_KEY)); } catch (e) { return false; } }
export function load() {
  if (!hasSave()) return false; let o; try { o = JSON.parse(store.getItem(SAVE_KEY)); } catch (e) { return false; } if (!o || o.v !== 1) return false;
  newGame(1 + Math.floor(Math.random() * 1e6));
  for (const k of SAVE_FIELDS) if (o[k] !== undefined) G[k] = o[k];
  G.owned.decor = G.owned.decor || {};
  const p = G.p; Object.assign(p, o.p || {}); if (p.canoe) { p.x = G.canoe.x; p.z = G.canoe.z; } p.swim = false; p.hidden = null;
  if (!p.canoe && (W.H(p.x, p.z) < -0.3 && !W.deckAt(p.x, p.z))) { p.x = W.SPAWN.x; p.z = W.SPAWN.z; }
  p.y = p.canoe ? 0 : W.ground(p.x, p.z); rollTrades(); return true;
}
export function wipeSave() { try { store && store.removeItem(SAVE_KEY); } catch (e) { } }
