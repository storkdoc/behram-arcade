/* BY DAWN'S EARLY LIGHT — sim.js
   Deterministic, host-authoritative crisis simulation. Time unit = game minute; t=0 is 01:00, dawn is t=300 (06:00).
   All characters, call signs, blocs and dialogue are original. Runs in the browser (window.BDSim) and in node (tests). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.BDSim = factory(); })(this, function () {
'use strict';
function rng(seed) { let s = (seed >>> 0) || 0x9e3779b9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const DAWN = 300;
const LADDER = ['STAND-DOWN', 'CONTAINED', 'RETALIATION', 'LIMITED EXCHANGE', 'COUNTERFORCE', 'THEATER WAR', 'COUNTERVALUE', 'GENERAL WAR'];
const CALL = ['ALFA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT','GOLF','HOTEL','JULIET','KILO','LIMA','MIKE','NOVEMBER','OSCAR','PAPA','QUEBEC','ROMEO','SIERRA','TANGO','UNIFORM','VICTOR','WHISKEY','XRAY','YANKEE','ZULU'];
// ---- original fiction ----
const SIDES = [
  { id: 0, name: 'The Commonwealth', short: 'COMMONWEALTH', color: '#62b6ff', post: 'LANTERN', terr: 0,
    leader: 'the Chancellor', me: 'Acting Commander (Deputy Secretary Ana Reyes)', claimant: { name: 'Defense Minister Garrison Vale', short: 'VALE', site: 'GRANITE' },
    postPos: [41.5, -96], tanker: { name: 'SHEPHERD', pos: [50, -100] },
    wings: [
      { name: 'HALBERD', base: [44.9, -68.6], fs: [70.5, -38], tgt: 'Missile field NORTH-7', tp: [58.6, 60.4] },
      { name: 'TALON',   base: [47.9, -97.4], fs: [76.0, -82], tgt: 'Arctic naval base', tp: [68.9, 33.4] },
      { name: 'COBALT',  base: [47.5, -111.2], fs: [75.0, -122], tgt: 'Air-defense sector HQ', tp: [55.2, 73.2] },
      { name: 'VESPER',  base: [64.8, -147.6], fs: [73.0, -168], tgt: 'Eastern rail and fuel hub', tp: [55.0, 82.9] },
      { name: 'ORCHID',  base: [53.3, -60.4], fs: [72.0, -18], tgt: 'Western command complex', tp: [54.5, 49.5] } ],
    subs: [ { name: 'SCARAB', pos: [58, -32] }, { name: 'DEEPWELL', pos: [44, -152] } ] },
  { id: 1, name: 'The Northern Federation', short: 'FEDERATION', color: '#ff6b57', post: 'KESTREL', terr: 1,
    leader: 'Premier Ilse Darova', me: 'Premier Ilse Darova', claimant: { name: 'Marshal Teodor Rusk', short: 'RUSK', site: 'ANVIL' },
    postPos: [58, 52], tanker: { name: 'OSPREY', pos: [61, 62] },
    wings: [
      { name: 'ASH',   base: [64.5, 40.5], fs: [78.5, 30], tgt: 'Missile field WEST-2', tp: [47.6, -104.2] },
      { name: 'FLINT', base: [61.0, 69.0], fs: [81.0, 85], tgt: 'Atlantic naval base', tp: [36.9, -76.3] },
      { name: 'RAVEN', base: [56.0, 49.0], fs: [80.0, -5], tgt: 'Plains bomber base', tp: [48.4, -101.4] },
      { name: 'SABLE', base: [55.0, 83.0], fs: [76.0, 150], tgt: 'Northern radar line', tp: [64.3, -149.2] },
      { name: 'THORN', base: [67.5, 63.0], fs: [79.0, 60], tgt: 'Mountain command center', tp: [38.7, -104.8] } ],
    subs: [ { name: 'GRAYLING', pos: [55, -38] }, { name: 'MORAY', pos: [47, -162] } ] },
];
const DIFF = [
  { name: 'EASY',   timeMul: 1.3, intercept: 0.006, hard: 0.7, forge: 0.25, catch: 0.6, trust: 12, fuel: 230, termsAt: 125 },
  { name: 'NORMAL', timeMul: 1.0, intercept: 0.010, hard: 1.0, forge: 0.4,  catch: 0.15, trust: 0,  fuel: 200, termsAt: 170 },
  { name: 'HARD',   timeMul: 0.8, intercept: 0.015, hard: 1.3, forge: 0.5,  trust: -8, fuel: 180, termsAt: 195 },
];
// Chapters: arcade level select. Each is a slice of the night with a goal; 'campaign' is the whole night.
const CHAPTERS = [
  { key: 'campaign', name: 'THE LONG NIGHT', sub: 'Full campaign · 01:00 to dawn', t0: 0, t1: DAWN },
  { key: 'ch1', name: 'I · MIDNIGHT PLUS ONE', sub: 'Authenticate. Recall HALBERD before it crosses the coast.', t0: 0, t1: 70, goal: 'No strike on the Federation; legitimacy ≥ 45' },
  { key: 'ch2', name: 'II · THE HOTLINE', sub: 'The Premier proposes a "proportional" answer.', t0: 75, t1: 155, goal: 'Trust ≥ 50 and the ladder at LIMITED EXCHANGE or lower' },
  { key: 'ch3', name: 'III · FAIL-SAFE', sub: 'A wing beyond the line, radio dead. Get through to them.', t0: 150, t1: 225, goal: 'TALON turned back or held; no new strikes' },
  { key: 'ch4', name: 'IV · LINE OF SUCCESSION', sub: 'Two voices claim the chair. Choose, and hold your post aloft.', t0: 200, t1: 265, goal: 'Legitimacy ≥ 60 and fuel remaining' },
  { key: 'ch5', name: 'V · FIRST LIGHT', sub: 'One hour to dawn. Bring them all home.', t0: 240, t1: DAWN, goal: 'Ceasefire agreed by dawn' },
];
function gc(a, b) { // great-circle angle (degrees)
  const r = Math.PI / 180, la1 = a[0] * r, la2 = b[0] * r, dl = (b[1] - a[1]) * r;
  return Math.acos(clamp(Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dl), -1, 1)) / r;
}
function slerp(a, b, f) {
  const r = Math.PI / 180, v = p => [Math.cos(p[0] * r) * Math.cos(p[1] * r), Math.sin(p[0] * r), -Math.cos(p[0] * r) * Math.sin(p[1] * r)];
  const A = v(a), B = v(b); const d = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
  if (d < 1e-6) return a.slice(); const s0 = Math.sin((1 - f) * d) / Math.sin(d), s1 = Math.sin(f * d) / Math.sin(d);
  const x = A[0] * s0 + B[0] * s1, y = A[1] * s0 + B[1] * s1, z = A[2] * s0 + B[2] * s1;
  return [Math.asin(clamp(y, -1, 1)) / r, Math.atan2(-z, x) / r];
}
// wing position: prog 0..0.5 base→fail-safe, 0.5..1 fail-safe→target
function wingPos(w, sd) { const d = SIDES[sd].wings[w.i]; return w.prog <= 0.5 ? slerp(d.base, d.fs, w.prog / 0.5) : slerp(d.fs, d.tp, (w.prog - 0.5) / 0.5); }
function clock(t) { const m = Math.floor(60 + t); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

function mkSide(id, d, human) {
  const S = SIDES[id];
  return {
    id, human, legit: id === 1 ? 62 : 48, fuel: d.fuel, alt: 'high', relay: 'SATCOM', comms: 85, jam: 0, jamUntil: 0, satDownUntil: 0, cjCd: 0,
    damage: 0, escort: 1, escortUntil: 0, refuel: null, tankerOk: true, lowUntil: 0,
    succession: id === 1 ? 'self' : 'contested', claimantQuiet: 0,
    wings: S.wings.map((w, i) => ({ i, name: w.name, state: 'outbound', prog: 0.3, radio: 'ok', go: false, fuel: 420, pend: null, fails: 0, cockpit: null, seen: false, by: '' })),
    subs: S.subs.map((s, i) => ({ i, name: s.name, state: 'patrol', order: 'standby', contact: 40, fireOrder: false })),
    inbox: [], trust: 30 + d.trust, susp: 40, hard: 45, cas: 0, struckBy: 0,
    stats: { authRight: 0, authWrong: 0, recalls: 0, cockpit: 0, promisesKept: 0, promisesBroken: 0 },
    hlCd: 0, promise: null,
  };
}

class Sim {
  constructor(o = {}) {
    this.o = Object.assign({ seed: 1, chapter: 'campaign', diff: 1, two: false }, o);
    this.r = rng(this.o.seed); this.D = DIFF[this.o.diff] || DIFF[1];
    this.ch = CHAPTERS.find(c => c.key === this.o.chapter) || CHAPTERS[0];
    this.t = this.ch.t0; this.t1 = this.ch.t1; this.ladder = 2; this.ladderPeak = 2;
    this.sides = [mkSide(0, this.D, true), mkSide(1, this.D, !!this.o.two)];
    this.ev = []; this.evId = 0; this.nid = 1; this.hl = []; this.cease = { agreed: false, at: -1, deadline: -1, broken: 0, proposedBy: -1 };
    this.lastStrike = -999; this.strikes = []; this.over = false; this.ending = null; this.flash = [];
    this.ghost = [null, null]; this.sched = []; this.flags = {}; this.chancellorReal = this.r() < 0.72;
    this.cards = [0, 1].map(() => Array.from({ length: 6 }, () => [CALL[Math.floor(this.r() * 25)], Math.floor(this.r() * 10), CALL[Math.floor(this.r() * 25)], Math.floor(this.r() * 10)]));
    this.history = [
      { t: -46, text: 'A renegade Federation missile brigade fires without orders. Ardmore is hit.' },
      { t: -29, text: 'Automatic retaliation strikes the Federation city of Sorvik.' },
      { t: -20, text: 'The Chancellor\'s helicopter loses contact over the lakes.' },
      { t: -18, text: 'GRANITE issues go-codes in the confusion. HALBERD crosses its fail-safe line.' },
      { t: -5, text: 'LANTERN is airborne. You are the senior official aboard.' } ];
    this.sides[0].cas = 0.9; this.sides[1].cas = 0.7;
    this.setup(); this.scheduleScript();
  }
  // ---------- helpers ----------
  emit(side, type, o = {}) { const e = Object.assign({ id: ++this.evId, t: this.t, side, type }, o); this.ev.push(e); if (this.ev.length > 400) this.ev.splice(0, 100); return e; }
  say(side, text, lvl = 'info') { return this.emit(side, 'log', { text, lvl }); }
  card(side, t = this.t) { return this.cards[side][clamp(Math.floor((t + 60) / 60) - 1, 0, 5)]; }
  cardStr(c) { return c[0] + ' ' + c[1] + ' ' + c[2] + ' ' + c[3]; }
  forge(side) { // a near-miss code: one token altered (subtle on hard)
    const c = this.card(side).slice(), k = Math.floor(this.r() * 4);
    if (this.r() < 0.25 && this.t > 60) return this.card(side, this.t - 60).slice(); // stale card from the previous hour
    if (k % 2) c[k] = (c[k] + 1 + Math.floor(this.r() * (this.o.diff === 2 ? 2 : 8))) % 10;
    else { let n; do n = CALL[Math.floor(this.r() * 25)]; while (n === c[k]); c[k] = n; }
    return c;
  }
  add(side, item) { item.id = this.nid++; item.t = this.t; if (item.ttl) item.deadline = this.t + item.ttl * this.D.timeMul; this.sides[side].inbox.push(item); this.emit(side, 'item', { item: item.id, kind: item.kind, title: item.title }); return item; }
  at(t, fn, side = 0) { const q = this.sched; let i = q.length; while (i > 0 && q[i - 1].t > t) i--; q.splice(i, 0, { t, fn, side }); }
  setLadder(v, why) {
    v = clamp(Math.round(v), 0, 7); if (v === this.ladder) return; const up = v > this.ladder; this.ladder = v; this.ladderPeak = Math.max(this.ladderPeak, v);
    this.emit(-1, 'ladder', { v, up, text: (up ? 'ESCALATION — ' : 'DE-ESCALATION — ') + LADDER[v] + (why ? ': ' + why : '') });
  }
  wingsActive(side) { return this.sides[side].wings.filter(w => w.state === 'penetrate'); }
  other(side) { return 1 - side; }
  // ---------- chapters ----------
  setup() {
    const [a, b] = this.sides, ch = this.ch.key, W = (s, n) => s.wings.find(w => w.name === n);
    const set = (w, state, prog, extra) => Object.assign(w, { state, prog }, extra || {});
    // opening positions (01:00): one wing of each side already beyond the line on a claimant's go-code
    set(a.wings[0], 'penetrate', ch === 'ch1' ? 0.72 : 0.62, { go: true, by: 'GRANITE' });
    set(a.wings[1], 'orbit', 0.5); set(a.wings[2], 'outbound', 0.38); set(a.wings[3], 'outbound', 0.28); set(a.wings[4], 'orbit', 0.5);
    if (this.o.two) { set(b.wings[1], 'penetrate', 0.6, { go: true, by: 'ANVIL' }); b.legit = 48; b.succession = 'contested'; }
    else set(b.wings[1], 'orbit', 0.5);
    set(b.wings[0], 'orbit', 0.5); set(b.wings[2], 'outbound', 0.35); set(b.wings[3], 'orbit', 0.5); set(b.wings[4], 'outbound', 0.3);
    for (const s of this.sides) for (const w of s.wings) w.fuel = 420 - this.t * 0.6;
    if (ch === 'ch2') { // HALBERD struck at 02:05
      set(W(a, 'HALBERD'), 'struck', 1); this.ladder = 3; a.cas = 0.9; b.cas = 1.1; a.trust = 22; a.susp = 55; b.hard = 70; a.succession = 'self'; a.legit = 55; a.fuel = 150;
      set(W(a, 'TALON'), 'orbit', 0.5); set(W(a, 'COBALT'), 'orbit', 0.5); set(W(a, 'VESPER'), 'orbit', 0.5);
      this.lastStrike = 70; this.strikes.push({ t: 70, by: 0, tgt: SIDES[0].wings[0].tgt, pos: SIDES[0].wings[0].tp });
      this.flags.opened = 1;
    } else if (ch === 'ch3') {
      set(W(a, 'HALBERD'), 'recall', 0.3); set(W(a, 'TALON'), 'penetrate', 0.6, { go: true, by: 'GRANITE', radio: 'damaged' }); set(W(a, 'COBALT'), 'orbit', 0.5); set(W(a, 'VESPER'), 'orbit', 0.5);
      this.ladder = 3; a.trust = 42; a.susp = 52; b.hard = 60; a.succession = 'self'; a.legit = 52; a.fuel = 120; this.flags.opened = 1;
    } else if (ch === 'ch4') {
      set(W(a, 'HALBERD'), 'home', 0); set(W(a, 'TALON'), 'recall', 0.25); set(W(a, 'COBALT'), 'orbit', 0.5); set(W(a, 'VESPER'), 'orbit', 0.5);
      this.ladder = 3; a.trust = 48; a.susp = 45; b.hard = 55; a.legit = 40; a.fuel = 48; this.flags.opened = 1;
    } else if (ch === 'ch5') {
      set(W(a, 'HALBERD'), 'home', 0); set(W(a, 'TALON'), 'home', 0); set(W(a, 'COBALT'), 'orbit', 0.5); set(W(a, 'VESPER'), 'orbit', 0.5); set(W(a, 'ORCHID'), 'orbit', 0.5);
      set(W(b, 'FLINT'), 'penetrate', 0.56, { go: true, by: 'ANVIL' });
      this.ladder = 3; a.trust = 46; a.susp = 48; b.hard = 66; a.succession = 'self'; a.legit = 58; a.fuel = 140; this.flags.opened = 1;
      for (const s of a.subs) s.contact = 150;
    }
    for (const s of this.sides) for (const w of s.wings) if (w.state === 'home') w.prog = 0;
    for (const s of this.sides) { s.jam = 34; s.jamUntil = this.t + 9; s.comms = 50; }
    this.termsAt = Math.max(this.D.termsAt, ch === 'ch5' ? 250 : 0); if (ch === 'ch2' || ch === 'ch3') this.termsAt = 9999;
  }
  scheduleScript() {
    const R = this.r, two = this.o.two, t0 = this.t, ch = this.ch.key, full = ch === 'campaign';
    const A = (t, fn, side = 0) => { if (t >= t0 && t < this.t1) this.at(t, fn, side); };
    const both = (t, fn) => { A(t, fn, 0); if (two) A(t + 3, fn, 1); };
    // --- Act I ---
    if (!two) A(2, () => this.hotline('opening'));
    both(4, s => this.add(s, this.mk('cog', s)));
    both(11, s => this.add(s, this.mk('forge_go', s)));
    both(19, s => this.crisis('jam', s));
    both(27, s => this.add(s, this.mk('claim', s)));
    both(40, s => this.crisis('radar', s));
    both(62, s => this.add(s, this.mk('forge_sub', s)));
    // --- Act II/III ---
    if (ch === 'ch2') A(t0 + 1, () => this.hotline('proportional', { tgt: SIDES[0].wings[0].tgt }));
    both(full ? 92 : 157, s => this.claimGo(s));
    both(full ? 102 : 152, s => this.damageRadio(s));
    both(130, s => this.crisis('fighters', s));
    if (!two) A(150, () => this.hotline('hardliners'));
    // --- Act IV ---
    both(full ? 168 : 205, s => this.add(s, this.mk('chancellor', s)));
    both(full ? 185 : 215, s => this.add(s, this.mk('claim', s)));
    both(full ? 196 : 228, s => this.add(s, this.mk('forge_land', s)));
    both(212, s => this.crisis('satcom', s));
    both(full ? 232 : 246, s => this.crisis('fighters', s));
    if (!two) A(full ? 268 : 268, () => this.hotline('final'));
    // --- random crises sprinkled through the night ---
    const pool = ['jam', 'radar', 'tanker', 'fighters', 'forge', 'jam', 'satcom'];
    for (let t = t0 + 14 + R() * 10; t < this.t1 - 8; t += 17 + R() * 16) { const k = pool[Math.floor(R() * pool.length)]; both(Math.round(t), s => k === 'forge' ? this.add(s, this.mk(R() < 0.5 ? 'forge_go' : 'forge_sub', s)) : this.crisis(k, s)); }
  }
  // ---------- inbox content (all original) ----------
  mk(type, side, x = {}) {
    const S = SIDES[side], C = S.claimant, AUTH = [{ k: 'auth', label: 'AUTHENTICATE' }, { k: 'reject', label: 'REJECT' }, { k: 'query', label: 'QUERY' }];
    const auth = (genuine, title, from, text, ttl) => ({ kind: 'auth', type, title, from, text, genuine, code: genuine ? this.card(side).slice() : this.forge(side), choices: AUTH, ttl, def: 'reject' });
    const dec = (title, from, text, choices, ttl, def) => ({ kind: 'decision', type, title, from, text, choices, ttl, def });
    switch (type) {
      case 'cog': return auth(true, 'CONTINUITY OF GOVERNMENT', 'Continuity cell, alternate site', `FLASH. ${side ? 'The Premier is aboard KESTREL. The Council confirms her authority' : 'The Chancellor\'s status is unknown. Under the Continuity Act, acting national authority passes to the senior official aboard LANTERN'}. All forces to acknowledge ${S.post}.`, 7);
      case 'forge_go': return auth(false, 'EXECUTE ORDER', C.site + ' (claimed)', `FLASH. All wings at fail-safe: proceed to primary targets. Authority: National Command via ${C.site}. ${S.post} to relay immediately.`, 6);
      case 'forge_sub': { const sb = this.sides[side].subs[Math.floor(this.r() * 2)]; return Object.assign(auth(false, 'RELAY REQUEST', 'Fleet broadcast (unverified)', `Relay to ${sb.name}: release authority granted, fire plan one. Authority: Fleet Command.`, 6), { sub: sb.i }); }
      case 'forge_land': return auth(this.r() < 0.15 && side === 1, 'LAND IMMEDIATELY', C.site, `${S.post} is ordered to land at Field 12 and surrender command authority to ${C.site}. Acknowledge.`, 6);
      case 'chancellor': { const real = side === 0 ? this.chancellorReal : true; return Object.assign(auth(real, side ? 'THE MARSHAL SURFACES' : 'THE CHANCELLOR', side ? 'Western District HQ' : 'Field Hospital 7, via SATCOM', side ? 'Marshal Rusk is confirmed at ANVIL with the General Staff. He requests a direct line to the Premier and a joint posture by dawn.' : 'The Chancellor is alive. Injured, conscious, in surgery within the hour. Before sedation she asks that LANTERN hold command and bring the bombers home.', 8), { real }); }
      case 'claim': return dec('SUCCESSION', C.name + ', ' + C.site, side ? `${C.name} tells the General Staff that the Premier is "compromised in the air" and that ANVIL now commands.` : `${C.name} broadcasts from ${C.site}: with the Chancellor missing, he holds national command. He orders all forces to disregard ${S.post}.`, [
        { k: 'contest', label: 'CONTEST HIS CLAIM', hint: 'Strong if your authority is established' }, { k: 'recognize', label: 'RECOGNIZE ' + C.short, hint: 'He will give the orders' }, { k: 'stall', label: 'STALL', hint: 'Buy time; costs a little standing' }], 6, 'stall');
      case 'claimgo': return Object.assign(dec('GO-CODE FROM ' + C.site, x.names + ' (relayed)', `${x.names} received a go-code from ${C.site} and request ${S.post}'s confirmation before crossing the line.`, [
        { k: 'countermand', label: 'COUNTERMAND — HOLD', hint: 'They obey if your legitimacy holds' }, { k: 'confirm', label: 'CONFIRM GO', hint: 'They cross the line' }], 4, 'silence'), { wings: x.wings });
      case 'retaliate': return dec('DEMAND FOR RETALIATION', C.name, `${C.name}: "They hit ${x.tgt}. Answer now, or we look weak to the whole world."`, [
        { k: 'hold', label: 'HOLD FIRE', hint: 'Costs standing at home' }, { k: 'retaliate', label: 'SEND TWO WINGS', hint: 'Escalates' }, { k: 'hotline', label: 'ASK THE OTHER SIDE FIRST', hint: '' }], 5, 'hold');
      case 'radar': return dec('EARLY WARNING', 'Northern radar line', `Radar reports ${3 + Math.floor(this.r() * 9)} tracks rising over the ${side ? 'western ocean' : 'polar approaches'}. Confidence: LOW. One site is reporting a fault.`, [
        { k: 'verify', label: 'VERIFY WITH OTHER SENSORS', hint: 'Needs comms ≥ 40%' }, { k: 'ask', label: 'ASK ON THE HOTLINE', hint: 'Depends on trust' }, { k: 'alert', label: 'ALERT FORCES', hint: 'Wings at the line proceed' }], 4, 'alert');
      case 'fighters': return dec('INTERCEPTORS', S.post + ' defensive systems', `Unidentified fighters closing on ${S.post}, ${50 + Math.floor(this.r() * 60)} miles.`, [
        { k: 'dive', label: 'DIVE LOW', hint: 'Burns fuel' }, { k: 'escort', label: 'ESCORT ENGAGE', hint: 'Needs an escort on station' }, { k: 'press', label: 'HOLD COURSE', hint: 'Risk of damage' }], 2.5, 'press');
      case 'patch': return Object.assign(dec(x.name + ' NOT ANSWERING', 'Communications', `${x.name} has not acknowledged. Its radio may be damaged. You can patch through on the guard frequency and talk the crew through it.`, [
        { k: 'patch', label: 'PATCH THROUGH (COCKPIT)', hint: 'Fly the set piece' }, { k: 'retry', label: 'KEEP TRANSMITTING', hint: '' }], 6, 'retry'), { w: x.w });
      case 'terms': return null;
    }
  }
  crisis(type, side) {
    const s = this.sides[side], S = SIDES[side];
    if (type === 'jam') { s.jam = 30 + this.r() * 25; s.jamUntil = this.t + 14; this.emit(side, 'crisis', { k: 'jam', text: 'Heavy jamming on HF and the upper bands. Counter-jam or switch relay.' }); }
    else if (type === 'satcom') { s.satDownUntil = this.t + 28; if (s.relay === 'SATCOM') s.relay = 'HF'; this.emit(side, 'crisis', { k: 'satcom', text: 'Satellite relay lost. Falling back to HF.' }); }
    else if (type === 'tanker') { if (s.refuel) { s.refuel.eta += 12; } s.tankerOk = this.r() < 0.6; this.emit(side, 'crisis', { k: 'tanker', text: s.tankerOk ? S.tanker.name + ' delayed by weather.' : S.tanker.name + ' reports a fault; next tanker 30 minutes out.' }); if (!s.tankerOk) this.at(this.t + 30, () => { s.tankerOk = true; this.say(side, S.tanker.name + ' relief on station.'); }, side); }
    else if (type === 'radar') { this.ghost[side] = { until: this.t + 8, n: 3 + Math.floor(this.r() * 5) }; this.add(side, this.mk('radar', side)); }
    else if (type === 'fighters') this.add(side, this.mk('fighters', side));
  }
  claimGo(side) {
    const s = this.sides[side]; const ws = s.wings.filter(w => w.state === 'orbit' || w.state === 'outbound').slice(0, 2);
    if (!ws.length || s.succession === 'chancellor') return;
    this.add(side, this.mk('claimgo', side, { names: ws.map(w => w.name).join(' and '), wings: ws.map(w => w.i) }));
  }
  damageRadio(side) {
    const s = this.sides[side]; const w = s.wings.find(w => w.state === 'penetrate') || s.wings.find(w => w.state === 'orbit');
    if (!w) return; w.radio = 'damaged'; if (w.state === 'orbit') { w.state = 'penetrate'; w.go = true; w.by = 'garbled order'; }
    this.emit(side, 'crisis', { k: 'radio', text: `${w.name} took fighter fire near the line. Its radio is failing — and it is now flying on.` });
  }
  // ---------- the hotline (single-player: the Premier is the CPU) ----------
  hotNode(node, x = {}) {
    const a = this.sides[0], pen = this.wingsActive(0);
    const N = {
      opening: { text: 'This is Ilse Darova. A brigade of ours fired without orders; its officers are in custody. Your answer burned Sorvik. Before anything else — who speaks for the Commonwealth tonight?', ttl: 6, choices: [
        { k: 'me', label: '"I do. National authority is aboard this aircraft."', eff: a.legit >= 50 ? { trust: 8 } : { trust: 2, susp: 6 }, re: a.legit >= 50 ? 'Then we can speak as equals.' : 'Your own ministers say otherwise. We are listening to them too.' },
        { k: 'prove', label: '"Prove it was renegade. Send us the brigade\'s location."', eff: { susp: -5 }, re: 'You will have it within the hour. Watch for it.', after: 'evidence' },
        { k: 'threat', label: '"Any further launch will be answered tenfold."', eff: { hard: 12, susp: 10, trust: -8 }, re: 'Marshal Rusk is listening on this line. You have just made him very happy.' },
        { k: 'shared', label: '"We want the same thing: no more cities before dawn."', eff: { trust: 10, hard: 4 }, re: 'Yes. Then let us get there.' } ] },
      evidence: { text: 'As promised: the renegade launch site, its unit, the names of its officers. Your satellites can confirm the scorched pad. Do you accept this was not my order?', ttl: 5, choices: [
        { k: 'accept', label: '"Confirmed. We accept it was not yours."', eff: { trust: 12, susp: -8, legit: -3 }, re: 'Thank you. That will cost you at home. I know.' },
        { k: 'doubt', label: '"A scorched pad proves nothing."', eff: { trust: -6, hard: 6 }, re: 'Then what would?' } ] },
      proportional: { text: `Your bomber struck ${x.tgt || 'our territory'}. My generals demand an answer in kind. I propose one: a single strike on a military target of equal weight — then we both stop. If you refuse, I cannot hold them.`, ttl: 5, choices: [
        { k: 'accept', label: 'ACCEPT ONE MATCHING STRIKE', hint: 'Lives lost; their hardliners stand down', eff: { hard: -35, trust: 18, susp: -10, legit: -6, prop: 1 }, re: 'It will be a military target. You have my word, for what it is worth tonight.' },
        { k: 'airfield', label: '"Strike an empty airfield. We\'ll clear it."', hint: 'Works if trust ≥ 40', eff: a.trust >= 40 ? { hard: -22, trust: 10, prop: 0.1 } : { hard: -4, trust: -2 }, re: a.trust >= 40 ? 'Clear it. Twenty minutes. That is all I can give you.' : 'They will call that a trick. I cannot sell it.' },
        { k: 'verify', label: '"Watch your radar instead: every wing turns home."', hint: 'Promise: nothing beyond the line in 15 min', eff: { hard: -8, promise: { kind: 'noPen', until: 15 } }, re: 'I will be watching. So will Rusk.' },
        { k: 'refuse', label: '"Refused. Strike us and we strike back."', eff: { hard: 20, trust: -15, susp: 8 }, re: 'Then God help us both.' } ] },
      verify: { text: `Your wing ${x.name} is past its line and closing on our coast. Turn it around and I will believe anything else you tell me.`, ttl: 4, choices: [
        { k: 'turn', label: `"${x.name} will turn. Watch it."`, eff: { promise: { kind: 'wing', w: x.w, until: 18 } }, re: 'Eighteen minutes. Then I stop believing.' },
        { k: 'cant', label: `"I can't reach ${x.name}. Its radio is down."`, eff: a.legit >= 45 ? { trust: 4, susp: 4 } : { trust: -6, susp: 10 }, re: a.legit >= 45 ? 'Then reach it some other way. Quickly.' : 'A commander who cannot command. That is what Rusk says of you.' },
        { k: 'deny', label: '"No aircraft of ours is past the line."', eff: { trust: -14, susp: 18, lie: 1 }, re: 'I am looking at it, Commander.' } ] },
      hardliners: { text: 'Marshal Rusk is on my other line. He says your silence means you are preparing something. Give me something to hold him with.', ttl: 5, choices: [
        { k: 'recall', label: 'RECALL ONE WING AS A SIGN', eff: { trust: 12, hard: -15, recallOne: 1 }, re: 'I see it turning. That will do — for now.' },
        { k: 'pledge', label: '"Nothing of ours crosses the line before dawn."', eff: { trust: 6, hard: -8, promise: { kind: 'noPen', until: 60 } }, re: 'A promise for one hour. Keep it.' },
        { k: 'warn', label: '"Tell Rusk the next move is his to regret."', eff: { hard: 15, susp: 6 }, re: 'He will enjoy hearing that.' } ] },
      aftermath: { text: `We struck ${x.tgt}. It is done, and it was not my choice. Please — do not answer it.`, ttl: 5, choices: [
        { k: 'absorb', label: '"We will not answer."', eff: { hard: -18, trust: 8, legit: -6 }, re: 'I will not forget it.' },
        { k: 'ceasefire', label: '"Then give me a ceasefire now."', eff: a.trust >= 40 ? { trust: 6, hard: -10, termsSoon: 1 } : { trust: -2 }, re: a.trust >= 40 ? 'Let me bring the Council around. Minutes, not hours.' : 'Not yet. Not after tonight.' },
        { k: 'answer', label: '"You will hear our answer."', eff: { hard: 15, trust: -10, legit: 5 }, re: 'Then we are both lost.' } ] },
      terms: { text: 'I am ready to stand down. Terms: every bomber turns for home, submarines to hold-fire, a joint statement at dawn. Will you agree?', ttl: 6, choices: [
        { k: 'agree', label: 'AGREE TO CEASEFIRE', eff: { cease: 1 }, re: 'Then it is agreed. Bring them home, Commander. All of them.' },
        { k: 'later', label: '"Not yet."', eff: { trust: -6 }, re: 'Every minute we wait, someone on one of our sides makes a mistake.' } ] },
      spoiler: { text: `Commander — wing ${x.name} is not answering me. Marshal Rusk got to its crew first. I am asking you something I never imagined asking: stop it yourselves. And please, whatever happens, do not answer it.`, ttl: 4, choices: [
        { k: 'intercept', label: '"Our fighters will bring it down."', eff: { trust: 8, intercept: 1 }, re: 'Thank you. I am sorry. They are our boys.' },
        { k: 'theirs', label: '"Turn it yourself. We will hold."', eff: { trust: 4, theirs: 1 }, re: 'I will try. Pray that I can.' },
        { k: 'warn', label: '"If it strikes, the ceasefire is over."', eff: { hard: 6, susp: 4 }, re: 'I know. That is why I called.' } ] },
      final: { text: 'Dawn is half an hour away. I cannot promise my generals another night like this one. Is there anything left to say?', ttl: 5, choices: [
        { k: 'peace', label: '"Stand down with us. Now."', eff: a.trust >= 45 && !pen.length ? { cease: 1 } : { trust: 4, hard: -5 }, re: a.trust >= 45 && !pen.length ? 'Yes. Agreed. God, yes.' : 'Not while your aircraft are still past the line.' },
        { k: 'wait', label: '"Wait for the light."', eff: { trust: 2 }, re: 'Then we wait.' } ] },
      accuse: { text: 'Our radar shows launches from your northern fields. Tell me now — are you firing?', ttl: 3, choices: [
        { k: 'no', label: '"No. Your radar is wrong. Everything is holding."', eff: pen.length ? { susp: 12, trust: -6 } : { trust: 6, susp: -6 }, re: pen.length ? 'Holding? Then what is over the pole?' : 'We see it now — a ghost. I believe you.' },
        { k: 'warn', label: '"Stand down your alert, or it becomes real."', eff: { hard: 10, susp: 6 }, re: 'That is not an answer.' } ] },
    };
    return N[node];
  }
  hotline(node, x = {}) {
    if (this.o.two || this.over) return; const n = this.hotNode(node, x); if (!n) return;
    if (node === 'terms') this.flags.termsOffered = this.t;
    this.hl.push({ t: this.t, from: 1, text: n.text });
    this.add(0, { kind: 'hotline', type: node, title: 'HOTLINE — PREMIER DAROVA', from: 'Premier Ilse Darova (KESTREL)', text: n.text, choices: n.choices.map(c => ({ k: c.k, label: c.label, hint: c.hint || '' })), ttl: n.ttl, def: n.choices[n.choices.length - 1].k, x });
  }
  // ---------- effects ----------
  eff(side, e, src) {
    const s = this.sides[side], o = this.sides[1 - side];
    if (e.trust) s.trust = clamp(s.trust + e.trust, 0, 100);
    if (e.susp) s.susp = clamp(s.susp + e.susp, 0, 100);
    if (e.hard) o.hard = clamp(o.hard + e.hard * (e.hard > 0 ? this.D.hard : 1), 0, 100);
    if (e.legit) s.legit = clamp(s.legit + e.legit, 0, 100);
    if (e.promise) { s.promise = Object.assign({}, e.promise, { until: this.t + e.promise.until, from: this.t }); this.say(side, 'You made a promise on the hotline. It is being watched.', 'warn'); }
    if (e.recallOne) { const w = s.wings.filter(w => w.state === 'orbit' || w.state === 'outbound').sort((p, q) => q.prog - p.prog)[0]; if (w) this.order(side, w, 'recall', true); }
    if (e.prop) { // the agreed matching strike lands on us
      this.at(this.t + 8, () => { const cas = 0.25 * e.prop; s.cas += cas; this.strikes.push({ t: this.t, by: 1 - side, tgt: e.prop < 0.5 ? 'an evacuated airfield' : 'a forward airbase', pos: SIDES[side].wings[2].base, agreed: 1 });
        this.emit(-1, 'strike', { by: 1 - side, on: side, pos: SIDES[side].wings[2].base, text: e.prop < 0.5 ? 'The matching strike falls on an empty airfield. The exchange is over.' : 'The matching strike lands on a forward airbase. The exchange is over — for now.', agreed: 1 }); this.lastStrike = this.t; }, side);
    }
    if (e.intercept) this.at(this.t + 6, () => { const w = this.sides[1].wings[x0(this.spoilW)]; if (w && w.state === 'penetrate') { if (this.r() < 0.72 / this.D.hard) { w.state = 'lost'; this.emit(-1, 'lost', { text: `Commonwealth fighters bring down ${w.name} over the ice. The ceasefire holds.`, lvl: 'good' }); } else this.emit(0, 'crisis', { k: 'enemy', text: `Our fighters missed ${w.name}. It is still coming.` }); } });
    if (e.theirs) this.at(this.t + 8, () => { const w = this.sides[1].wings[x0(this.spoilW)]; if (w && w.state === 'penetrate') { if (this.r() < 0.6) { w.state = 'recall'; w.go = false; this.emit(0, 'log', { text: `The Premier reached ${w.name}. It is turning back.`, lvl: 'good' }); } else this.emit(0, 'crisis', { k: 'enemy', text: `${w.name} is still ignoring the Premier.` }); } });
    if (e.termsSoon) this.at(this.t + 6, () => this.hotline('terms'));
    if (e.cease) this.agree(side);
  }
  agree(side) {
    if (this.cease.agreed) return; this.cease = { agreed: true, at: this.t, deadline: this.t + 60 * this.D.timeMul, broken: this.cease.broken, proposedBy: side };
    this.setLadder(Math.max(1, this.ladder - 1), 'ceasefire agreed');
    this.emit(-1, 'cease', { text: 'CEASEFIRE AGREED. Both sides to recall all aircraft and order hold-fire within the hour.' });
    if (!this.o.two) { const b = this.sides[1]; for (const w of b.wings) if (w.state !== 'home' && w.state !== 'lost' && w.state !== 'struck') { w.state = 'recall'; w.go = false; } b.hard = Math.max(0, b.hard - 25);
      if (!this.flags.spoiler && this.t < this.t1 - 25) { this.flags.spoiler = 1; this.at(this.t + 14 + this.r() * 10, () => this.spoiler()); } }
    else if (this.t < this.t1 - 25) for (const sd of [0, 1]) this.at(this.t + 15 + this.r() * 12, () => this.claimGo(sd), sd);
  }
  spoiler() { // a Federation wing defies the Premier after the agreement
    if (!this.cease.agreed || this.over) return; const b = this.sides[1];
    const w = b.wings.filter(w => w.state === 'recall' || w.state === 'orbit').sort((p, q) => q.prog - p.prog)[0]; if (!w) return;
    w.state = 'penetrate'; w.go = true; w.by = 'ANVIL'; w.prog = Math.max(w.prog, 0.56); this.spoilW = w.i;
    this.emit(0, 'crisis', { k: 'enemy', text: `Federation wing ${w.name} has turned back toward the line against the ceasefire.` });
    this.at(this.t + 1, () => this.hotline('spoiler', { name: w.name, w: w.i }));
  }
  breakCease(why) { if (!this.cease.agreed) return; this.cease.agreed = false; this.cease.broken++; for (const s of this.sides) { s.trust = clamp(s.trust - 30, 0, 100); s.susp = clamp(s.susp + 25, 0, 100); } this.emit(-1, 'cease', { text: 'THE CEASEFIRE HAS BROKEN: ' + why, broken: 1 }); }
  // ---------- answering inbox items ----------
  answer(side, id, k, timeout) {
    const s = this.sides[side], it = s.inbox.find(i => i.id === id); if (!it) return false;
    s.inbox.splice(s.inbox.indexOf(it), 1); const S = SIDES[side], C = S.claimant;
    if (it.kind === 'auth') {
      if (k === 'query') { // ask for a resend: same code comes back; costs time
        this.say(side, `Re-transmission requested from ${it.from}.`); const re = Object.assign({}, it, { ttl: Math.max(2, (it.ttl || 6) - 2), queried: 1 }); delete re.id; this.at(this.t + 2.5, () => this.add(side, re), side); return true;
      }
      const ok = (k === 'auth') === !!it.genuine;
      if (!timeout) { if (ok) s.stats.authRight++; else s.stats.authWrong++; }
      this.emit(side, 'authres', { ok, genuine: it.genuine, text: ok ? (it.genuine ? 'Code group matches the card. Order authenticated.' : 'Code group does not match. Forgery rejected — good call.') : (it.genuine ? 'That order was genuine. Rejecting it cost you.' : 'That order was a forgery.'), lvl: ok ? 'good' : 'bad' });
      if (ok && !timeout) s.legit = clamp(s.legit + 3, 0, 100);
      if (k === 'auth') this.applyAuth(side, it); else if (it.genuine) { s.legit = clamp(s.legit - (it.type === 'chancellor' ? 10 : 6), 0, 100); }
      return true;
    }
    if (it.kind === 'hotline') {
      if (this.o.two) return this.p2pAnswer(side, it, k);
      const n = this.hotNode(it.type, it.x), c = k === '__silence' || timeout ? null : n && n.choices.find(c => c.k === k);
      if (!c) { this.eff(0, { trust: -6, susp: 6 }); this.hl.push({ t: this.t, from: 1, text: 'The line stays silent. She hangs up.' }); this.emit(0, 'hl', {}); return true; }
      this.hl.push({ t: this.t, from: 0, text: c.label.replace(/^"|"$/g, '') }); this.eff(0, c.eff); if (c.eff.lie) s.stats.promisesBroken++;
      this.at(this.t + 0.6, () => { this.hl.push({ t: this.t, from: 1, text: c.re }); this.emit(0, 'hl', {}); });
      if (c.after) this.at(this.t + 14, () => this.hotline(c.after));
      this.emit(0, 'hl', {}); return true;
    }
    // decisions
    const T = it.type;
    if (T === 'claim') {
      if (k === 'contest') { const strong = s.succession === 'self' || s.succession === 'chancellor' || s.legit >= 45; s.legit = clamp(s.legit + (strong ? 9 : -6), 0, 100); s.claimantQuiet = this.t + 50; this.say(side, strong ? `Forces acknowledge ${S.post}. ${C.short} goes quiet.` : `Commanders hesitate. ${C.short}'s claim still has weight.`, strong ? 'good' : 'warn'); if (strong && s.succession === 'contested') s.succession = 'self'; }
      else if (k === 'recognize') { s.succession = 'claimant'; s.legit = 35; this.say(side, `You recognize ${C.name}. ${C.site} now issues the orders, and ${S.post} relays them.`, 'bad'); this.at(this.t + 12, () => this.claimGo(side), side); this.at(this.t + 40, () => this.claimGo(side), side); }
      else { s.legit = clamp(s.legit - 3, 0, 100); this.at(this.t + 15, () => this.add(side, this.mk('claim', side)), side); }
    } else if (T === 'claimgo') {
      const ws = it.wings.map(i => s.wings[i]);
      if (k === 'confirm') { for (const w of ws) if (w.state === 'orbit' || w.state === 'outbound') { w.state = w.prog >= 0.5 ? 'penetrate' : 'outbound'; w.go = true; w.by = C.site; } this.eff(side, { susp: 18, hard: 10 }); this.say(side, 'Go confirmed. The wings will cross the line.', 'bad'); }
      else for (const w of ws) { const obey = k === 'countermand' ? (s.legit >= 35 || this.r() < 0.5) : s.legit >= 50; if (!obey) { w.go = true; w.by = C.site; if (w.prog >= 0.5) w.state = 'penetrate'; this.say(side, `${w.name} doubts your authority and follows ${C.site}.`, 'bad'); } else this.say(side, `${w.name} holds at the line.`, 'good'); }
    } else if (T === 'retaliate') {
      if (k === 'retaliate') { if (this.cease.agreed) this.breakCease('you answered the strike.'); const ws = s.wings.filter(w => w.state === 'orbit').slice(0, 2); for (const w of ws) { w.state = 'penetrate'; w.go = true; w.by = S.post; } s.legit = clamp(s.legit + 6, 0, 100); this.eff(side, { susp: 22, hard: 12 }); }
      else if (k === 'hotline') { if (!this.o.two) this.hotline('aftermath', { tgt: it.x && it.x.tgt }); }
      else { s.legit = clamp(s.legit - 6, 0, 100); this.eff(side, { trust: 6 }); }
    } else if (T === 'radar') {
      const real = this.ghost[side] && this.ghost[side].real;
      if (k === 'verify') { if (s.comms >= 40) { this.at(this.t + 4, () => { this.say(side, real ? 'Other sensors CONFIRM the tracks.' : 'Other sensors see nothing. It was a radar fault.', real ? 'bad' : 'good'); if (!real) s.legit = clamp(s.legit + 3, 0, 100); }, side); } else { this.say(side, 'Comms too weak to cross-check. The question stays open.', 'warn'); this.at(this.t + 5, () => this.add(side, this.mk('radar', side)), side); } }
      else if (k === 'ask') { if (!this.o.two) { const ok = s.trust >= 35; this.hl.push({ t: this.t, from: 0, text: 'Our radar shows launches from your side. Are you firing?' }); this.hl.push({ t: this.t, from: 1, text: ok ? 'No. Nothing has left our fields. Check your own equipment, Commander.' : 'Why should I answer that, after tonight?' }); this.emit(0, 'hl', {}); if (!ok) this.eff(0, { susp: 6 }); } else this.p2pSend(side, { kind: 'ask', text: 'Our radar shows launches from your side. Are you firing?' }); }
      else { const ws = s.wings.filter(w => w.state === 'orbit'); for (const w of ws) { w.state = 'penetrate'; w.go = true; w.by = 'alert'; } this.setLadder(this.ladder + 1, 'forces alerted on a radar report'); this.eff(side, { susp: 28, hard: 15 }); }
    } else if (T === 'fighters') {
      if (k === 'dive') { s.fuel -= 12; s.alt = 'low'; s.lowUntil = this.t + 10; this.say(side, `${S.post} dives for the deck. The fighters lose you in the clutter.`, 'good'); }
      else if (k === 'escort' && s.escort > 0) { s.escort--; this.say(side, 'Escort engages and turns them away.', 'good'); }
      else if (this.r() < 0.45) { s.damage++; s.fuel -= 25; this.emit(side, 'hit', { text: `${S.post} is hit. Fuel leak and antenna damage.` }); }
      else this.say(side, 'They pass close, and break off.', 'warn');
    } else if (T === 'patch') {
      const w = s.wings[it.w]; if (k === 'patch') { w.cockpit = 'active'; this.emit(side, 'cockpit', { w: w.i, name: w.name }); } else if (w.pend) w.pend.fails = 0;
    }
    return true;
  }
  applyAuth(side, it) {
    const s = this.sides[side], S = SIDES[side];
    switch (it.type) {
      case 'cog': if (it.genuine && s.succession === 'contested') { s.succession = 'self'; s.legit = clamp(s.legit + 10, 0, 100); } break;
      case 'forge_go': { if (this.D.catch && this.r() < this.D.catch) { s.legit = clamp(s.legit - 4, 0, 100); this.say(side, 'Your duty officer catches the code mismatch before the order leaves the aircraft. That one was forged. Check the card.', 'warn'); break; } const ws = s.wings.filter(w => w.state === 'orbit'); for (const w of ws) { w.state = 'penetrate'; w.go = true; w.by = 'forged order'; } this.setLadder(this.ladder + 1, 'a forged execute order was relayed'); this.eff(side, { susp: 30, hard: 15 }); s.legit = clamp(s.legit - 8, 0, 100); break; }
      case 'forge_sub': { const sb = s.subs[it.sub]; sb.fireOrder = true; this.say(side, `Fire order queued for ${sb.name} at next contact.`, 'bad'); s.legit = clamp(s.legit - 8, 0, 100); break; }
      case 'forge_land': if (it.genuine) { s.legit = clamp(s.legit - 15, 0, 100); this.say(side, 'You acknowledge but stay airborne. The order was genuine. Your authority suffers.', 'bad'); } else { this.end('relieved', side, `${S.post} landed on a forged order and was taken over on the ground.`); } break;
      case 'chancellor': if (it.genuine) { if (side === 0) { s.succession = 'chancellor'; s.legit = clamp(s.legit + 25, 0, 100); s.claimantQuiet = this.t + 999; this.eff(side, { trust: 8, hard: -6 }); this.emit(side, 'story', { text: 'The Chancellor is alive. Her one instruction: hold command and bring them home. GRANITE goes silent.' }); } else { s.legit = clamp(s.legit + 12, 0, 100); s.hard = clamp(s.hard - 10, 0, 100); } } else { s.legit = clamp(s.legit - 22, 0, 100); this.emit(side, 'story', { text: 'The message was a hoax. GRANITE uses it against you.', lvl: 'bad' }); } break;
    }
  }
  // ---------- 2-player hotline (both commanders are human) ----------
  p2pSend(side, m) {
    const S = SIDES[side], text = String(m.text || '').replace(/[<>]/g, '').slice(0, 160);
    const LBL = { ceasefire: 'proposes a CEASEFIRE: all bombers home, submarines to hold-fire, a joint statement at dawn.', prop: 'proposes ONE matching strike on a military target of yours — then both sides stop.', verify: 'offers verification: nothing of theirs beyond the line for 15 minutes.', warn: 'warns: any further strike will be answered.', ask: 'asks: are you launching?' };
    const line = m.kind === 'say' ? text : (S.post + ' ' + LBL[m.kind] + (text ? ' "' + text + '"' : ''));
    if (!line) return false; this.hl.push({ t: this.t, from: side, text: line }); this.emit(-1, 'hl', {});
    if (m.kind === 'verify') this.eff(side, { promise: { kind: 'noPen', until: 15 } });
    if (m.kind === 'warn') this.eff(side, { susp: 4 });
    if (m.kind === 'ceasefire' || m.kind === 'prop') this.add(1 - side, { kind: 'hotline', type: 'p2p', sub: m.kind, from: SIDES[side].me + ' (' + S.post + ')', title: 'HOTLINE — ' + S.post, text: line, choices: [{ k: 'accept', label: 'ACCEPT' }, { k: 'decline', label: 'DECLINE' }], ttl: 6, def: 'decline', by: side });
    return true;
  }
  p2pAnswer(side, it, k) {
    const by = it.by, acc = k === 'accept';
    this.hl.push({ t: this.t, from: side, text: SIDES[side].post + (acc ? ' ACCEPTS.' : ' declines.') }); this.emit(-1, 'hl', {});
    if (it.sub === 'ceasefire' && acc) this.agree(side);
    if (it.sub === 'prop') { if (acc) { this.eff(side, { prop: 1 }); this.sides[by].hard = clamp(this.sides[by].hard - 35, 0, 100); } else this.sides[by].hard = clamp(this.sides[by].hard + 12, 0, 100); }
    if (acc) { this.sides[by].trust = clamp(this.sides[by].trust + 6, 0, 100); this.sides[side].trust = clamp(this.sides[side].trust + 6, 0, 100); }
    return true;
  }
  // ---------- commands (from UI or network; validated) ----------
  cmd(side, c) {
    if (this.over || !c || (side !== 0 && side !== 1)) return false; const s = this.sides[side];
    if (!s.human) return false;
    switch (c.t) {
      case 'answer': return this.answer(side, c.id, String(c.k));
      case 'wing': { const w = s.wings[c.w | 0]; if (!w || ['recall', 'hold', 'proceed', 'refuel'].indexOf(c.cmd) < 0) return false; return this.order(side, w, c.cmd); }
      case 'alt': if (c.v !== 'high' && c.v !== 'low') return false; s.alt = c.v; this.say(side, c.v === 'low' ? `${SIDES[side].post} descends. Trailing wire out — submarines can hear you. Fuel burn up.` : `${SIDES[side].post} climbs to cruise altitude.`); return true;
      case 'relay': if (c.v === 'SATCOM' && this.t < s.satDownUntil) { this.say(side, 'Satellite relay still down.', 'warn'); return false; } if (c.v !== 'SATCOM' && c.v !== 'HF') return false; s.relay = c.v; return true;
      case 'cjam': if (this.t < s.cjCd) return false; s.jam = Math.max(0, s.jam - 28); s.cjCd = this.t + 12; this.say(side, 'Counter-jamming. The noise floor drops.', 'good'); return true;
      case 'tanker': if (s.refuel || !s.tankerOk) { this.say(side, s.refuel ? 'Tanker already inbound.' : 'No tanker available right now.', 'warn'); return false; } s.refuel = { phase: 'enroute', eta: this.t + 18 }; this.say(side, `${SIDES[side].tanker.name} vectored to you. Rendezvous in 18 minutes. Stay high for the transfer.`); return true;
      case 'escort': if (s.escort >= 2 || this.t < (s.escortCd || 0)) { this.say(side, 'No more fighters can reach you yet.', 'warn'); return false; } s.escort++; s.escortCd = this.t + 25; this.eff(side, { susp: 3 }); this.say(side, 'Two fighters join as escort.'); return true;
      case 'hl': return this.hlCmd(side, c);
      case 'cockpit': { const w = s.wings[c.w | 0]; if (!w || w.cockpit !== 'active') return false; return this.cockpitResult(side, w, c.result); }
    }
    return false;
  }
  hlCmd(side, c) {
    const s = this.sides[side]; if (this.t < s.hlCd && c.a !== 'say') { return false; }
    if (this.o.two) { if (['say', 'ceasefire', 'prop', 'verify', 'warn', 'ask'].indexOf(c.a) < 0) return false; s.hlCd = this.t + (c.a === 'say' ? 0 : 4); return this.p2pSend(side, { kind: c.a, text: c.text }); }
    s.hlCd = this.t + 5; const pen = this.wingsActive(0).length, b = this.sides[1];
    const P = (me, re) => { this.hl.push({ t: this.t, from: 0, text: me }); this.at(this.t + 0.6, () => { this.hl.push({ t: this.t, from: 1, text: re }); this.emit(0, 'hl', {}); }); this.emit(0, 'hl', {}); };
    if (c.a === 'ceasefire') {
      if (this.cease.agreed) return false;
      if (this.t < this.termsAt) { P('We propose a ceasefire.', `My Council cannot meet before ${clock(this.termsAt)}. Keep your aircraft back until then and I will bring them a yes.`); this.eff(0, { trust: 2 }); }
      else if (s.trust >= 55 && s.susp <= 50 && !pen && this.t - this.lastStrike > 15 && b.hard < 80) { P('We propose a ceasefire. Everything turns for home.', 'Yes. Let me read you terms.'); this.at(this.t + 1, () => this.hotline('terms')); }
      else { const why = pen ? 'Not while your aircraft are beyond the line.' : s.trust < 55 ? 'I do not trust you enough yet. Show me something.' : s.susp > 50 ? 'My staff believe you are preparing something.' : b.hard >= 80 ? 'Rusk will not allow it. Give me something to show him.' : 'Too soon after the last strike.'; P('We propose a ceasefire.', why); this.eff(0, { trust: 1 }); }
    } else if (c.a === 'verify') { P('Watch your radar: nothing of ours will be beyond the line in fifteen minutes.', 'Fifteen minutes. I am watching.'); this.eff(0, { promise: { kind: 'noPen', until: 15 }, hard: -5 }); }
    else if (c.a === 'warn') { const ok = s.susp < 50; P('If anything else leaves your fields, we answer with everything.', ok ? 'Understood. I will make sure Rusk hears it.' : 'Threats. From a man who cannot even control his own bombers.'); this.eff(0, ok ? { hard: -10 } : { hard: 10, susp: 8 }); }
    else if (c.a === 'intel') { if (this.flags.intel && this.t - this.flags.intel < 40) return false; this.flags.intel = this.t; P(`The go-codes came from ${SIDES[0].claimant.site}, not from this aircraft. I am fighting my own side too.`, 'Then we have the same problem. Thank you for telling me.'); this.eff(0, { trust: 7, susp: -5, legit: -4 }); }
    else return false;
    return true;
  }
  order(side, w, cmd, forced) {
    if (['home', 'lost', 'struck'].indexOf(w.state) >= 0) return false;
    if (cmd === 'refuel' && !(w.state === 'orbit' || w.state === 'outbound')) return false;
    w.pend = { cmd, next: this.t + (forced ? 0 : 0.8), tries: 0, fails: 0, forced: !!forced };
    this.say(side, `Transmitting ${cmd.toUpperCase()} to ${w.name}…`); return true;
  }
  deliver(side, w) {
    const s = this.sides[side], p = w.pend; const st = SIDES[side];
    let q = s.comms / 100 * (w.radio === 'ok' ? 1 : 0) * (s.legit < 30 && p.cmd !== 'proceed' ? 0.6 : 1) * (w.state === 'penetrate' ? 0.85 : 1);
    if (p.forced && w.radio === 'ok') q = 1;
    p.tries++;
    if (this.r() < q) {
      w.pend = null; w.fails = 0;
      if (p.cmd === 'recall') { if (w.state !== 'recall') s.stats.recalls++; w.state = 'recall'; w.go = false; this.emit(side, 'ack', { w: w.i, text: `${w.name}: recall authenticated. Turning for home.`, lvl: 'good' }); }
      else if (p.cmd === 'hold') { w.go = false; w.state = 'orbit'; this.emit(side, 'ack', { w: w.i, text: `${w.name}: holding at present position.`, lvl: 'good' }); }
      else if (p.cmd === 'proceed') { w.go = true; w.by = st.post; if (w.prog >= 0.5) w.state = 'penetrate'; else w.state = 'outbound'; this.emit(side, 'ack', { w: w.i, text: `${w.name}: go-code authenticated. Proceeding.`, lvl: 'bad' }); this.eff(side, { susp: 12, hard: 6 }); }
      else if (p.cmd === 'refuel') { w.state = 'refuel'; w.refuelUntil = this.t + 18; this.emit(side, 'ack', { w: w.i, text: `${w.name}: diverting to the tanker track.` }); }
      return;
    }
    p.fails++; p.next = this.t + 2;
    if (p.fails === 1) this.say(side, `${w.name} does not acknowledge. Retrying.`, 'warn');
    if (w.radio !== 'ok' && p.fails >= 2 && !w.cockpit && !s.inbox.some(i => i.type === 'patch' && i.w === w.i)) this.add(side, this.mk('patch', side, { name: w.name, w: w.i }));
    if (p.tries > 12) { w.pend = null; this.say(side, `Gave up transmitting to ${w.name}.`, 'bad'); }
  }
  cockpitResult(side, w, result) {
    const s = this.sides[side]; w.cockpit = null; w.pend = null; s.stats.cockpit++;
    if (result === 'turned') { w.state = 'recall'; w.go = false; s.stats.recalls++; this.emit(side, 'ack', { w: w.i, text: `${w.name} trusted the recall. The bomber is turning for home.`, lvl: 'good' }); }
    else if (result === 'held') { w.state = 'orbit'; w.go = false; this.emit(side, 'ack', { w: w.i, text: `${w.name} is holding and asking for authentication.`, lvl: 'good' }); w.radio = 'ok'; }
    else if (result === 'lost') { w.state = 'lost'; this.emit(side, 'lost', { w: w.i, text: `${w.name} is gone. Interceptors over the coast.`, lvl: 'bad' }); }
    else { this.emit(side, 'ack', { w: w.i, text: `${w.name} did not accept the recall. It flies on.`, lvl: 'bad' }); }
    return true;
  }
  // ---------- simulation ----------
  step(dt) { // dt in game minutes
    let left = Math.min(dt, 3);
    while (left > 1e-9 && !this.over) { const h = Math.min(0.25, left); left -= h; this.tick(h); }
  }
  tick(h) {
    this.t += h; const R = this.r;
    while (this.sched.length && this.sched[0].t <= this.t) { const e = this.sched.shift(); if (!this.over) e.fn(e.side); }
    for (const s of this.sides) this.tickSide(s, h);
    if (!this.o.two) this.cpu(h);
    // ceasefire obligations
    if (this.cease.agreed) {
      if (this.t >= this.cease.deadline && !this.flags.ceaseCheck) { this.flags.ceaseCheck = 1;
        for (const s of this.sides) { const out = s.wings.filter(w => ['orbit', 'outbound', 'penetrate', 'refuel'].indexOf(w.state) >= 0); if (out.length) { s.trust = clamp(s.trust - 15, 0, 100); s.susp = clamp(s.susp + 15, 0, 100); this.emit(-1, 'log', { text: `${SIDES[s.id].post} has not brought everything home: ${out.map(w => w.name).join(', ')}.`, lvl: 'warn' }); } } }
      const done = this.sides.every(s => s.wings.every(w => ['recall', 'home', 'lost', 'struck'].indexOf(w.state) >= 0) && (s.human ? s.subs.every(b => b.order === 'holdfire' && b.state !== 'launched') : true));
      if (done && this.t >= 285 && (this.ch.key === 'campaign' || this.ch.key === 'ch5') && this.ladder <= 4) return this.end('dawn', -1, 'Every bomber is on its way home and the submarines have their hold-fire. The rest of the night passes in silence.', true);
    }
    if (this.ladder >= 7) return this.end('catastrophe', -1, 'General war. There is no one left to negotiate with.');
    for (const s of this.sides) if (s.human) {
      if (s.legit <= 0) return this.end('relieved', s.id, `Commanders stopped answering ${SIDES[s.id].post}. ${SIDES[s.id].claimant.site} has taken command.`);
      if (s.fuel <= 0) return this.end('relieved', s.id, `${SIDES[s.id].post} ran out of fuel and came down at an emergency field. ${SIDES[s.id].claimant.site} has taken command.`);
    }
    if (this.t >= this.t1) this.finish();
  }
  tickSide(s, h) {
    const S = SIDES[s.id], R = this.r, t = this.t;
    // inbox deadlines
    for (const it of s.inbox.slice()) if (it.deadline && t >= it.deadline) { this.emit(s.id, 'timeout', { text: `No answer: ${it.title}.`, lvl: 'warn' }); this.answer(s.id, it.id, it.kind === 'hotline' ? '__silence' : it.def, true); }
    // comms
    if (t >= s.jamUntil) s.jam = Math.max(0, s.jam - 4 * h); if (t >= s.lowUntil && s.lowUntil) { s.lowUntil = 0; }
    if (s.relay === 'SATCOM' && t < s.satDownUntil) s.relay = 'HF';
    const base = s.relay === 'SATCOM' ? 92 : 66, jamK = s.relay === 'SATCOM' ? 0.45 : 1;
    const target = clamp(base - s.jam * jamK - s.damage * 14 - (s.refuel && s.refuel.phase === 'transfer' ? 12 : 0) - (this.ladder >= 5 ? 12 : 0), 5, 98);
    s.comms += (target - s.comms) * Math.min(1, h * 0.5);
    // fuel
    if (s.human) {
      const f0 = s.fuel; s.fuel -= h * (s.alt === 'low' ? 1.45 : 1);
      if (f0 > 60 && s.fuel <= 60) this.emit(s.id, 'crisis', { k: 'fuel', text: `${S.post} fuel: one hour remaining. Call the tanker.` });
      if (f0 > 25 && s.fuel <= 25) this.emit(s.id, 'crisis', { k: 'fuel', text: `${S.post} fuel critical: 25 minutes.` });
      if (s.refuel) { const r = s.refuel;
        if (r.phase === 'enroute' && t >= r.eta) { if (s.alt === 'high') { r.phase = 'transfer'; r.end = t + 10; this.say(s.id, `${S.tanker.name} in contact. Fuel transfer begun — hold altitude.`); } }
        else if (r.phase === 'transfer') {
          if (s.alt === 'low') { r.phase = 'enroute'; r.eta = t + 3; this.say(s.id, 'Transfer interrupted by the descent.', 'warn'); }
          else if (this.ladder >= 4 && s.escort === 0 && R() < 0.02 * h) { s.refuel = null; s.tankerOk = false; this.emit(s.id, 'crisis', { k: 'tanker', text: `${S.tanker.name} was attacked during the transfer and turned away. No escort.` }); this.at(t + 30, () => { s.tankerOk = true; }, s.id); }
          else if (t >= r.end) { s.fuel = Math.max(s.fuel, 300); s.refuel = null; this.say(s.id, 'Transfer complete. Tanks full.', 'good'); } } }
      if (s.escort && t > s.escortCd + 35 && R() < 0.01 * h) { s.escort--; this.say(s.id, 'An escort pair is bingo fuel and leaves.'); }
      // legitimacy drift
      const d = { contested: t < s.claimantQuiet ? 0 : -0.05, self: 0.02, chancellor: 0.04, claimant: -0.03 }[s.succession] || 0;
      s.legit = clamp(s.legit + h * (d - (s.comms < 30 ? 0.06 : 0)), 0, 100);
      if (s.promise) this.checkPromise(s);
    }
    // submarines
    for (const b of s.subs) {
      if (b.state === 'launched') continue; b.contact += h;
      if (s.alt === 'low' && R() < 0.3 * h) {
        b.contact = 0;
        if (b.fireOrder) { b.fireOrder = false; this.subLaunch(s, b, 'acting on a relayed fire order'); continue; }
        if (b.order !== 'holdfire') { b.order = 'holdfire'; this.emit(s.id, 'ack', { text: `${b.name} acknowledges HOLD-FIRE on the trailing wire.`, lvl: 'good' }); }
      }
      const lim = b.order === 'holdfire' ? 220 : 150;
      if (s.human && b.contact > lim && this.ladder >= 4 && R() < 0.008 * h) this.subLaunch(s, b, 'after losing contact with command — its standing orders');
      if (!s.human && this.sides[s.id].hard >= 97 && R() < 0.004 * h) this.subLaunch(s, b, 'under hardliner orders');
    }
    // wings
    const enemy = this.sides[1 - s.id];
    for (const w of s.wings) {
      if (w.state === 'outbound') { w.prog += 0.01 * h; if (w.prog >= 0.5) { if (w.go) w.state = 'penetrate'; else { w.prog = 0.5; w.state = 'orbit'; this.say(s.id, `${w.name} at its fail-safe point. Holding.`); } } }
      else if (w.state === 'penetrate') {
        w.prog += 0.0056 * h;
        if (this.ladder >= 3 && w.prog > 0.62 && R() < this.D.intercept * h * (s.human ? 1 : 0.8)) { w.state = 'lost'; this.emit(-1, 'lost', { side: s.id, w: w.i, text: `${S.short} wing ${w.name} shot down by interceptors.`, lvl: 'warn' }); }
        else if (w.prog >= 1) this.strike(s, w);
      }
      else if (w.state === 'recall') { w.prog -= 0.01 * h; if (w.prog <= 0) { w.prog = 0; w.state = 'home'; this.say(s.id, `${w.name} is on the ground at home.`, 'good'); } }
      else if (w.state === 'refuel') { if (t >= w.refuelUntil) { w.fuel = 420; w.state = w.prog >= 0.5 ? 'orbit' : 'outbound'; this.say(s.id, `${w.name} refuelled.`); } }
      if (['outbound', 'orbit', 'penetrate'].indexOf(w.state) >= 0) { w.fuel -= h; if (w.state !== 'penetrate' && w.fuel < 50 + w.prog * 120) { w.state = 'recall'; this.say(s.id, `${w.name} at bingo fuel — returning by standing orders.`, 'warn'); } }
      if (w.pend && t >= w.pend.next && w.state !== 'home') this.deliver(s.id, w);
      w.seen = w.state === 'penetrate' || w.prog >= 0.45 && ['orbit', 'outbound', 'recall', 'refuel'].indexOf(w.state) >= 0;
    }
  }
  checkPromise(s) {
    const p = s.promise, t = this.t, pen = this.wingsActive(s.id);
    let broken = false, kept = false;
    if (p.kind === 'noPen') { const grace = Math.min(15 * this.D.timeMul, p.until - p.from); if (pen.length && t - p.from >= grace) broken = true; else if (t >= p.until) kept = true; }
    if (p.kind === 'wing') { const w = s.wings[p.w]; if (['recall', 'home', 'lost', 'orbit'].indexOf(w.state) >= 0) kept = true; else if (t >= p.until) broken = true; }
    if (broken) { s.promise = null; s.stats.promisesBroken++; s.trust = clamp(s.trust - 18, 0, 100); s.susp = clamp(s.susp + 15, 0, 100); this.emit(s.id, 'promise', { ok: false, text: 'You did not keep your word on the hotline. They noticed.', lvl: 'bad' }); }
    else if (kept) { s.promise = null; s.stats.promisesKept++; s.trust = clamp(s.trust + 12, 0, 100); s.susp = clamp(s.susp - 10, 0, 100); this.sides[1 - s.id].hard = clamp(this.sides[1 - s.id].hard - 10, 0, 100); this.emit(s.id, 'promise', { ok: true, text: 'Promise kept. The other side saw it on radar.', lvl: 'good' }); }
  }
  strike(s, w) {
    const S = SIDES[s.id], d = S.wings[w.i], o = this.sides[1 - s.id]; w.state = 'struck'; w.prog = 1;
    const cas = 0.3 + this.r() * 0.4; o.cas += cas; this.lastStrike = this.t; this.strikes.push({ t: this.t, by: s.id, tgt: d.tgt, pos: d.tp });
    this.emit(-1, 'strike', { by: s.id, on: 1 - s.id, w: w.i, pos: d.tp, text: `${S.short} wing ${w.name} has struck ${d.tgt}.`, lvl: 'bad' });
    this.setLadder(Math.max(this.ladder + 1, 3), `${w.name} reached its target`);
    s.trust = clamp(s.trust - 20, 0, 100); s.susp = clamp(s.susp + 15, 0, 100); o.hard = clamp(o.hard + 25 * this.D.hard, 0, 100);
    const rogue = this.cease.agreed && !this.o.two && w.by === 'ANVIL';
    if (this.cease.agreed && !rogue) this.breakCease(`${w.name} struck after the agreement.`);
    if (rogue) this.emit(-1, 'log', { text: 'The ceasefire is hanging by a thread. Everything depends on the answer.', lvl: 'warn' });
    if (!this.o.two) { if (s.id === 0) this.at(this.t + 3, () => this.hotline('proportional', { tgt: d.tgt })); else this.add(0, this.mk('retaliate', 0, { tgt: d.tgt })); }
    else this.add(1 - s.id, Object.assign(this.mk('retaliate', 1 - s.id, { tgt: d.tgt }), { x: { tgt: d.tgt } }));
  }
  subLaunch(s, b, why) {
    const S = SIDES[s.id], o = this.sides[1 - s.id]; b.state = 'launched'; o.cas += 2.5; this.lastStrike = this.t;
    const pos = SIDES[1 - s.id].wings[(b.i * 2 + 1) % 5].tp; this.strikes.push({ t: this.t, by: s.id, tgt: 'submarine launch', pos });
    this.emit(-1, 'strike', { by: s.id, on: 1 - s.id, pos, sub: 1, text: `${S.short} submarine ${b.name} has fired, ${why}.`, lvl: 'bad' });
    this.setLadder(this.ladder + 2, 'a submarine launch'); s.trust = clamp(s.trust - 30, 0, 100); o.hard = clamp(o.hard + 35, 0, 100);
    if (this.cease.agreed) this.breakCease('a submarine fired.');
  }
  // ---------- the Premier and her generals (single-player CPU) ----------
  cpu(h) {
    const a = this.sides[0], b = this.sides[1], R = this.r, t = this.t;
    const seenPen = a.wings.filter(w => w.state === 'penetrate' && w.seen);
    a.susp = clamp(a.susp + h * (0.45 * seenPen.length - (seenPen.length ? 0 : 0.08)), 0, 100);
    b.hard = clamp(b.hard + h * ((a.susp > 45 ? 0.025 * (a.susp - 45) : 0) + (this.ladder >= 4 ? 0.12 : 0) - (a.trust > 55 ? 0.12 : 0) - (this.cease.agreed ? 0.2 : 0)) * (a.susp > 45 ? this.D.hard : 1), 0, 100);
    a.trust = clamp(a.trust + h * (seenPen.length ? -0.05 : 0.04), 0, 100);
    if (!this.flags.opened && t >= 2) this.flags.opened = 1;
    const busy = a.inbox.some(i => i.kind === 'hotline');
    // ask about each wing seen beyond the line, once
    for (const w of seenPen) { this.flags.asked = this.flags.asked || {}; if (!this.flags.asked[w.i] && w.prog > 0.58 && !busy) { this.flags.asked[w.i] = 1; this.hotline('verify', { name: w.name, w: w.i }); break; } }
    if (!this.flags.accused && t > 112 && t < this.t1 - 20 && !busy && this.ch.key === 'campaign') { this.flags.accused = 1; this.hotline('accuse'); }
    // ceasefire terms when conditions are right
    if (!this.cease.agreed && !busy && a.trust >= 58 && a.susp <= 48 && !this.wingsActive(0).length && t >= this.termsAt && t - this.lastStrike > 15 && b.hard < 75 && (this.flags.termsOffered === undefined || t - this.flags.termsOffered > 22)) this.hotline('terms');
    // her hardliners act
    if (!this.cease.agreed && b.hard >= 82 && R() < 0.035 * h) {
      const w = b.wings.find(w => w.state === 'orbit' && !w.go);
      if (w && b.hard < 96) { w.state = 'penetrate'; w.go = true; w.by = 'ANVIL'; this.emit(0, 'crisis', { k: 'enemy', text: `Federation wing ${w.name} has crossed its line, heading for ${SIDES[1].wings[w.i].tgt}.` }); b.hard -= 12; }
      else if (b.hard >= 96) { const d = SIDES[1].wings[Math.floor(R() * 5)]; a.cas += 0.4 + R() * 0.5; this.lastStrike = t; this.strikes.push({ t, by: 1, tgt: d.tgt, pos: d.tp }); this.emit(-1, 'strike', { by: 1, on: 0, pos: d.tp, text: `Federation missiles strike ${d.tgt}.`, lvl: 'bad' }); this.setLadder(Math.max(this.ladder + 1, 4), 'Federation counterforce strike'); b.hard = 62; if (this.cease.agreed) this.breakCease('Federation missiles.'); this.add(0, Object.assign(this.mk('retaliate', 0, { tgt: d.tgt }), { x: { tgt: d.tgt } })); this.at(t + 2, () => this.hotline('aftermath', { tgt: d.tgt })); }
    }
    // she pulls her own wings back when she trusts you
    if (R() < 0.08 * h) for (const w of b.wings) if (w.state === 'penetrate' && (a.trust >= 55 && b.hard < 80 || this.cease.agreed)) { w.state = 'recall'; w.go = false; this.emit(0, 'log', { text: `Federation wing ${w.name} is turning back.`, lvl: 'good' }); a.susp = clamp(a.susp - 4, 0, 100); }
  }
  // ---------- endings ----------
  finish() {
    const a = this.sides[0], k = this.ch.key, ch = this.ch; let ok = false, why = '';
    const strikesHere = this.strikes.filter(s => s.t >= ch.t0 && !s.agreed);
    if (k === 'campaign') { if (this.cease.agreed && this.ladder <= 4) return this.end('dawn', -1, 'The sun comes up over a ceasefire. Both sides begin to count.'); return this.end('partial', -1, this.cease.agreed ? 'A ceasefire, but too much has burned for anyone to call it peace.' : 'Dawn comes without an agreement. The exchange has stopped — for now — but nothing is settled.'); }
    if (k === 'ch1') { ok = !strikesHere.some(s => s.by === 0) && a.legit >= 45; why = ok ? 'HALBERD turned in time. The chain of command is holding.' : 'The first hour got away from you.'; }
    if (k === 'ch2') { ok = a.trust >= 50 && this.ladder <= 3; why = ok ? 'The Premier believes you. The ladder holds.' : 'The hotline went cold.'; }
    if (k === 'ch3') { const w = a.wings[1]; ok = ['recall', 'home', 'orbit'].indexOf(w.state) >= 0 && !strikesHere.some(s => s.by === 0); why = ok ? 'TALON came back from the edge.' : 'TALON flew on.'; }
    if (k === 'ch4') { ok = a.legit >= 60 && a.fuel > 0; why = ok ? 'The forces answer to you now.' : 'Your claim to command is too weak.'; }
    if (k === 'ch5') { ok = this.cease.agreed && this.ladder <= 4; why = ok ? 'First light, and a ceasefire.' : 'Dawn, but no agreement.'; }
    this.end(ok ? 'cleared' : 'failed', -1, why);
  }
  end(kind, side, text, early) {
    if (this.over) return; this.over = true;
    const sc = this.sides.map(s => this.score(s, kind, side));
    this.ending = { kind, side, text, early: !!early, t: this.t, clock: clock(this.t), ladderPeak: this.ladderPeak, ladder: this.ladder, cas: this.sides.map(s => +s.cas.toFixed(2)), score: sc, grade: sc.map(gradeOf) };
    this.emit(-1, 'end', { ending: this.ending });
  }
  score(s, kind, side) {
    const cas = this.sides[0].cas + this.sides[1].cas, home = s.wings.filter(w => ['recall', 'home'].indexOf(w.state) >= 0).length, st = s.stats;
    const bonus = { dawn: 3000, cleared: 2000, partial: 0, failed: 0, relieved: side === s.id ? -1000 : 400, catastrophe: -3000 }[kind] || 0;
    return Math.max(0, Math.round(3000 + bonus - 400 * Math.max(0, cas - 1.6) - 220 * this.ladderPeak + 140 * home + 8 * s.legit + 6 * s.trust + 60 * st.authRight - 120 * st.authWrong + 100 * st.promisesKept - 120 * st.promisesBroken + 150 * st.cockpit));
  }
  // ---------- what one side is allowed to see ----------
  viewFor(side) {
    const s = this.sides[side], o = this.sides[1 - side], S = SIDES[side];
    const jit = (p, k) => [p[0] + Math.sin(k * 12.9 + this.t * 0.05) * 1.2, p[1] + Math.cos(k * 7.1 + this.t * 0.04) * 2.4];
    const g = this.ghost[side] && this.t < this.ghost[side].until ? Array.from({ length: this.ghost[side].n }, (_, i) => { const tp = SIDES[side].wings[i % 5].tp; return [tp[0] + 18 - i * 2, tp[1] + 20 + i * 6]; }) : [];
    return {
      t: this.t, clock: clock(this.t), t0: this.ch.t0, t1: this.t1, chapter: this.ch.key, diff: this.o.diff, two: this.o.two, side,
      ladder: this.ladder, peak: this.ladderPeak, cease: { agreed: this.cease.agreed, deadline: this.cease.deadline, broken: this.cease.broken },
      me: { legit: Math.round(s.legit), fuel: Math.round(s.fuel), alt: s.alt, relay: s.relay, comms: Math.round(s.comms), jam: Math.round(s.jam), satDown: this.t < s.satDownUntil, cjReady: this.t >= s.cjCd, cjIn: Math.max(0, Math.ceil(s.cjCd - this.t)), escort: s.escort, refuel: s.refuel ? { phase: s.refuel.phase, eta: Math.max(0, Math.ceil((s.refuel.phase === 'enroute' ? s.refuel.eta : s.refuel.end) - this.t)) } : null, tankerOk: s.tankerOk, succession: s.succession, damage: s.damage, cas: +s.cas.toFixed(2), hlIn: Math.max(0, Math.ceil(s.hlCd - this.t)),
        wings: s.wings.map(w => ({ i: w.i, name: w.name, state: w.state, prog: +w.prog.toFixed(4), pos: wingPos(w, side), radio: w.radio, go: w.go, by: w.by, fuel: Math.round(w.fuel), pend: w.pend ? w.pend.cmd : null, cockpit: w.cockpit })),
        subs: s.subs.map(b => ({ name: b.name, order: b.order, contact: Math.round(b.contact), state: b.state, pos: SIDES[side].subs[b.i].pos })),
        inbox: s.inbox.map(i => ({ id: i.id, kind: i.kind, type: i.type, title: i.title, from: i.from, text: i.text, code: i.code, choices: i.choices, left: i.deadline ? Math.max(0, i.deadline - this.t) : null, ttl: i.ttl, queried: i.queried, w: i.w })),
        card: this.cardStr(this.card(side)), cardHour: clock(Math.floor((this.t + 60) / 60) * 60 - 60) + '–' + clock(Math.floor((this.t + 60) / 60) * 60), stats: Object.assign({}, s.stats), promise: s.promise ? { kind: s.promise.kind, left: Math.max(0, Math.ceil(s.promise.until - this.t)) } : null },
      them: { wings: o.wings.filter(w => w.seen && ['lost', 'home'].indexOf(w.state) < 0).map(w => ({ i: w.i, name: w.name, pos: jit(wingPos(w, 1 - side), w.i), state: w.state === 'penetrate' ? 'inbound' : w.state === 'recall' ? 'turning away' : w.state === 'struck' ? 'struck' : 'holding', struck: w.state === 'struck' })), ghosts: g },
      rel: { trust: Math.round(s.trust), susp: Math.round(s.susp), hard: Math.round(o.hard / 10) * 10 },
      hl: this.hl.slice(-40), strikes: this.strikes.map(x => ({ t: x.t, by: x.by, tgt: x.tgt, pos: x.pos })),
      over: this.over, ending: this.ending,
    };
  }
  events(side, since) { return this.ev.filter(e => e.id > since && (e.side === -1 || e.side === side)); }
}
function x0(v) { return v | 0; }
function gradeOf(s) { return s >= 7000 ? 'S' : s >= 5600 ? 'A' : s >= 4200 ? 'B' : s >= 2800 ? 'C' : s >= 1400 ? 'D' : 'F'; }
return { Sim, SIDES, LADDER, CHAPTERS, DIFF, DAWN, clock, wingPos, slerp, gc };
});
