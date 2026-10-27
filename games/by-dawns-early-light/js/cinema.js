/* BY DAWN'S EARLY LIGHT — cinema.js: letterboxed in-engine cutscenes.
   Every scene is rendered live by the Stage (sky set, cabin, orbit globe) with camera dollies and cranes,
   depth of field, film grain, lens flare and subtitles. Space, Enter, Escape, a click or a tap skips. */
import * as THREE from '../vendor/three/three.module.min.js';
import { valleyX, terrainH, llv, vll } from './render.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z), ease = u => u * u * (3 - 2 * u), L = (a, b, u) => a + (b - a) * u, LV = (a, b, u) => a.clone().lerp(b, u);
function headLL(a, b, f) { const A = llv(a[0], a[1], 1).normalize(), B = llv(b[0], b[1], 1).normalize(), d = Math.acos(Math.max(-1, Math.min(1, A.dot(B)))), s = Math.sin(d) || 1;
  const P = A.clone().multiplyScalar(Math.sin((1 - f) * d) / s).add(B.clone().multiplyScalar(Math.sin(f * d) / s)).normalize(); return vll(P); }
export const PLACES = { ardmore: [45.6, -89.5], sorvik: [59.5, 56.0], brigade: [52.5, 104.0], plains: [47.5, -104.0] };

/* shot helpers. Each returns {dur, mode, start(st, cin), update(u, T, st, cin), subs:[[t, text, who]]} */
function skyShot(dur, o) {
  return { dur, mode: 'sky', subs: o.subs || [], dof: o.dof ?? 0.35, focusY: o.focusY ?? 0.5, dawn: o.dawn, cover: o.cover, title: o.title,
    start(st, cin) { st.hidePlanes(); if (!o.keepNukes) { for (const n of st.nukes) n.dispose(); st.nukes = []; } st.terrC = null; (o.nukes || []).forEach(n => { if (n.at <= 0) { const d = st.skyNuke(n.pos, n); d.t = -n.at; } }); this._fired = new Set(); o.start && o.start(st, cin); },
    update(u, T, st, cin) { (o.nukes || []).forEach((n, i) => { if (n.at > 0 && T >= n.at && !this._fired.has(i)) { this._fired.add(i); st.skyNuke(n.pos, n); cin.A && n.klax && cin.A.klaxon(true); } });
      const P = o.planes ? o.planes(T, u) : {}; st.hidePlanes(); for (const k in P) st.place(k, P[k][0], P[k][1] || 0, P[k][2] || 0, P[k][3] || 0);
      const c = o.cam(T, u, P); st.skyCam = { pos: c[0], look: c[1], fov: c[2] || 45, roll: c[3] || 0 }; o.update && o.update(T, u, st, cin); } };
}
function cabShot(dur, o) {
  return { dur, mode: 'cabin', subs: o.subs || [], dof: o.dof ?? 0.25, focusY: o.focusY ?? 0.5, title: o.title, alert: o.alert,
    start(st, cin) { o.start && o.start(st, cin); const c = o.cam(0, 0); st.cab.pos.copy(c[0]); st.cab.look.copy(c[1]); },
    update(u, T, st, cin) { const c = o.cam(T, u); st.cab.tpos.copy(c[0]); st.cab.tlook.copy(c[1]); st.cab.pos.lerp(c[0], 0.2); st.cab.look.lerp(c[1], 0.2); o.update && o.update(T, u, st, cin); } };
}
function globeShot(dur, o) {
  return { dur, mode: 'globe', subs: o.subs || [], dof: o.dof ?? 0.15, focusY: 0.5, title: o.title,
    start(st, cin) { const c = o.cam(0, 0); st.camState.lat = st.camState.tlat = c[0]; st.camState.lon = st.camState.tlon = c[1]; st.camState.dist = st.camState.tdist = c[2]; this._f = new Set(); o.start && o.start(st, cin); },
    update(u, T, st, cin) { const c = o.cam(T, u); st.focus(c[0], c[1], c[2]); cin.ui.arcs = (o.arcs || []).map(a => ({ from: a.from, to: a.to, col: a.col, u: (T - a.t0) / a.dur })).filter(a => a.u > 0);
      (o.dets || []).forEach((d, i) => { if (T >= d.t && !this._f.has(i)) { this._f.add(i); st.globeDet(d.ll[0], d.ll[1]); } }); o.update && o.update(T, u, st, cin); } };
}
const postAt = (T, z0 = 0) => V3(0, 9500, z0 - 230 * T);

export const FILMS = {
  coldopen: (c) => [
    skyShot(9, { dawn: 0, cover: 0.6, subs: [[0.8, '00:58 · ABOVE THE NORTHERN PLAINS', 'cap'], [4.5, 'A quiet night. Airborne command post LANTERN on its routine orbit.', '']],
      planes: T => ({ post: [postAt(T), 0, 0, 0.04] }), cam: (T, u, P) => { const p = P.post[0]; return [p.clone().add(V3(L(260, 90, ease(u)), L(-60, 30, ease(u)), L(260, 120, ease(u)))), p.clone().add(V3(0, 4, -10)), 40]; } }),
    cabShot(7, { subs: [[1.2, 'RADAR: Single return. Low, fast, northern sector.', 'who'], [4.0, 'WATCH OFFICER: Ours?', 'who'], [5.4, 'RADAR: No squawk. No flight plan.', 'who']],
      cam: (T, u) => [LV(V3(0.6, 0.45, 1.6), V3(0.9, 0.2, -0.3), ease(u)), V3(1.6, 0.1, -0.4)], update: (T, u, st, cin) => { if (T > 1.1 && !cin.f('blip')) cin.A && cin.A.S.blip(); if (T > 3.2 && !cin.f('blip2')) cin.A && cin.A.S.blip(); } }),
    globeShot(10, { subs: [[0.6, 'A Federation border brigade fires without orders.', ''], [5.5, 'Its target is the Commonwealth city of Ardmore.', '']], arcs: [{ from: PLACES.brigade, to: PLACES.ardmore, t0: 0.5, dur: 8.5, col: '#ff8a70' }], dets: [{ t: 9.0, ll: PLACES.ardmore }],
      cam: (T, u) => { const h = headLL(PLACES.brigade, PLACES.ardmore, Math.max(0, Math.min(1, (T - 0.5) / 8.5))); return [Math.min(80, h[0] - 8), h[1], L(2.3, 2.6, u)]; } }),
    skyShot(16, { dawn: 0, cover: 0.3, dof: 0.2, focusY: 0.42, subs: [[3.2, 'PILOT: Flash — bearing two-seven-zero. Big.', 'who'], [9.0, 'CO-PILOT: That is Ardmore. That was Ardmore.', 'who']],
      nukes: [{ at: 1.4, pos: V3(-30000, 300, -16000), scale: 1.3, tscale: 2.2 }],
      planes: T => ({ post: [postAt(T), 0, 0, 0] }), cam: (T, u, P) => { const p = P.post[0]; return [p.clone().add(V3(-4.2, 3.4, 30)), V3(-30000, 4500 + 4000 * ease(u), -16000), L(46, 38, ease(u))]; } }),
    cabShot(6, { alert: true, subs: [[0.4, 'TELETYPE: ARDMORE SILENT. ALL STATIONS CONDITION ONE.', 'tty'], [3.2, 'TELETYPE: RETALIATORY ORDER ISSUED BY GRANITE.', 'tty']],
      cam: (T, u) => [LV(V3(0, 1.2, 6.8), V3(0, 0.5, 3.6), ease(u)), V3(0, 0, -5)], start: (st, cin) => { cin.A && cin.A.klaxon(true); st.shake = 0.9; } }),
    globeShot(7, { subs: [[0.5, 'Before anyone could stop it, an answer flew back.', ''], [4.2, 'Sorvik. Thirty minutes after Ardmore.', '']], arcs: [{ from: PLACES.plains, to: PLACES.sorvik, t0: 0.3, dur: 4.6, col: '#9fd0ff' }], dets: [{ t: 4.9, ll: PLACES.sorvik }],
      cam: (T, u) => { const h = headLL(PLACES.plains, PLACES.sorvik, Math.max(0, Math.min(1, (T - 0.3) / 4.6))); return [Math.min(80, h[0] - 8), h[1], L(2.6, 2.3, u)]; }, start: (st, cin) => cin.A && cin.A.klaxon(false) }),
    cabShot(9, { title: 'BY DAWN\u2019S EARLY LIGHT', subs: c.side ? [[3.4, 'You are Premier Ilse Darova, aloft in KESTREL. Your marshals are not all loyal.', ''], [6.4, 'Across the line, a stranger has just taken command of LANTERN.', '']] : [[3.4, 'The Chancellor\u2019s helicopter is missing. You are the senior official aboard LANTERN.', ''], [6.4, 'Until dawn — or until someone takes it from you — you hold command.', '']],
      cam: (T, u) => [LV(V3(0, 0.9, 6.6), V3(0.55, 0.35, 2.6), ease(u)), LV(V3(0, 0, -4), V3(-1.6, 0.05, 0.35), ease(u))] }),
  ],
  strike: (c) => { const sd = (c.text || '').length % 2 ? 1 : -1; return [skyShot(11, { dawn: c.dawn, cover: 0.35, dof: 0.06, focusY: 0.5, subs: [[0.4, (c.text || 'A strike.'), 'cap'], [6.0, c.on === c.side ? 'PILOT: That one was ours. God help them.' : 'PILOT: Detonation. Far side of the line.', 'who']],
    nukes: [{ at: 0.6, pos: V3(sd * 24000, 300, -20000), scale: 1.3, tscale: 2.6 }],
    planes: T => ({ post: [postAt(T), 0, 0, 0] }), cam: (T, u, P) => { const p = P.post[0]; return [p.clone().add(V3(sd * 3.0, 7.5, 34)), V3(sd * 24000, 1200 + 5200 * ease(u), -20000), L(46, 40, ease(u))]; } })].concat(c.pos ? [globeShot(7, { dof: 0.1, subs: [[1.2, 'From orbit, the light is the size of a city — and then it is gone.', 'cap']], cam: (T, u) => [c.pos[0] - 6 + 3 * u, c.pos[1] - 10 + 6 * u, L(2.1, 1.55, ease(u))], dets: [{ t: 0.9, ll: c.pos }] })] : []); },
  command: (c) => [cabShot(8, { subs: [[0.5, 'You take the chair at the authentication console.', ''], [3.8, 'Every order tonight passes through this aircraft — and through you.', '']], cam: (T, u) => [LV(V3(0, 0.9, 6.6), V3(0.55, 0.35, 2.6), ease(u)), LV(V3(0, 0, -4), V3(-1.6, 0.05, 0.35), ease(u))] })],
  chapter: (c) => [globeShot(6.5, { title: c.name, subs: [[1.4, c.sub, '']], cam: (T, u) => [L(55, 50, u), L(c.lon0 ?? -70, (c.lon0 ?? -70) + 30, ease(u)), L(3.1, 2.7, u)] })],
  hotline: (c) => [cabShot(8, { subs: [[0.6, 'The direct line to the Federation opens.', ''], [3.6, 'TELETYPE: PREMIER DAROVA IS ON THE LINE.', 'tty']], cam: (T, u) => [LV(V3(0, 0.7, -1.2), V3(0, 0.32, -3.7), ease(u)), V3(0, 0.1, -5.7)], update: (T, u, st, cin) => { if (T > 3.4 && !cin.f('tt')) cin.A && cin.A.S.teletype(16); } })],
  bomber: (c) => { const z0 = 0, x0 = valleyX(z0); return [skyShot(8, { dawn: c.dawn, cover: 0.8, dof: 0.3, subs: [[0.5, c.name + ' · PAST THE FAIL-SAFE LINE · RADIO DAMAGED', 'cap'], [3.6, 'PILOT: If that recall is real, we have to hear it ourselves.', 'who']],
    planes: T => { const z = z0 - 250 * T, x = valleyX(z); return { b1: [V3(x, terrainH(x, z) + 110, z), Math.atan2(-(valleyX(z - 50) - x), 50), 0, 0.15] }; },
    cam: (T, u, P) => { const p = P.b1[0]; return [p.clone().add(V3(L(-140, -40, ease(u)), L(10, 30, u), L(-60, 110, ease(u)))), p, 50]; } })]; },
  aftercockpit: (c) => { const turned = c.result === 'turned' || c.result === 'held'; return [skyShot(6, { dawn: c.dawn, cover: 0.6, keepNukes: false, subs: [[0.6, turned ? (c.result === 'held' ? c.name + ' is holding. The crew wants the code again — from you.' : c.name + ' banks hard and turns for home.') : c.result === 'lost' ? c.name + ' is gone.' : c.name + ' flies on toward its target.', '']],
    planes: T => ({ b1: [V3(400 * T * (turned ? 1 : 0), 9000, -230 * T), turned ? L(0, Math.PI * 0.9, Math.min(1, T / 5)) : 0, 0, turned ? -0.5 * Math.sin(Math.min(1, T / 5) * Math.PI) : 0] }),
    cam: (T, u, P) => { const p = P.b1[0]; return [V3(-260, 9060, 260), p, 32]; } })]; },
  end_dawn: (c) => [
    skyShot(14, { dawn: 1, cover: 0.5, dof: 0.25, subs: [[1.0, '06:00. The sun comes up over a ceasefire that held.', ''], [6.5, 'Wing by wing, the bombers report: turning for home.', ''], [10.5, 'No one won tonight. Everyone is still here to say so.', '']],
      planes: T => ({ post: [postAt(T), 0, 0, 0], b1: [postAt(T).add(V3(380, -260, 900)), 0.05, 0, 0], b2: [postAt(T).add(V3(-520, -340, 1300)), -0.04, 0, 0] }),
      cam: (T, u, P) => { const p = P.post[0]; return [p.clone().add(V3(L(-900, 300, ease(u)), L(-2400, 140, ease(u)), L(1600, 500, ease(u)))), p.clone().add(V3(0, 0, -600)), 48]; },
      update: (T, u, st, cin) => { cin.A && !cin.f('c') && cin.A.S.cease(); } }),
    globeShot(7, { subs: [[0.6, 'The line stayed open until the last aircraft landed.', '']], cam: (T, u) => [L(42, 48, u), L(-80, -60, u), L(3.2, 2.8, u)] })],
  end_partial: (c) => [
    skyShot(12, { dawn: 0.85, cover: 0.45, subs: [[1.0, 'Dawn comes to a smaller world.', ''], [6.0, 'The exchange stopped. Not soon enough, and not everywhere.', '']],
      nukes: [{ at: -40, pos: V3(-50000, 200, -40000), scale: 1.3 }, { at: -25, pos: V3(42000, 200, -52000), scale: 1.1 }],
      planes: T => ({ post: [postAt(T), 0, 0, 0] }), cam: (T, u, P) => { const p = P.post[0]; return [p.clone().add(V3(-30, 8, 60)), p.clone().add(V3(L(-30000, 20000, ease(u)), -4000, -50000)), 50]; } }),
    globeShot(8, { subs: [[0.8, 'Where the lights went out, they will not come back on tonight.', '']], cam: (T, u) => [L(55, 52, u), L(-95, -40, u), L(2.4, 2.9, u)] })],
  end_catastrophe: (c) => [
    skyShot(13, { dawn: 0.6, cover: 0.4, dof: 0.15, subs: [[1.4, 'There was no one left on the line.', ''], [7.0, 'By the time the sun rose, it rose on ash.', '']],
      nukes: [{ at: 1.0, pos: V3(-70000, 200, -50000), scale: 1.8 }, { at: 5.5, pos: V3(60000, 200, -64000), scale: 1.6 }],
      planes: T => ({ post: [postAt(T), 0, 0, 0] }), cam: (T, u, P) => { const p = P.post[0]; return [p.clone().add(V3(-20, 6, 50)), p.clone().add(V3(L(-40000, 30000, ease(u)), -3000, -60000)), 55]; } }),
    globeShot(8, { subs: [[0.8, 'General war. The ladder had no rungs left.', '']], cam: (T, u) => [L(58, 50, u), L(-30, 30, u), L(3.4, 3.0, u)] })],
  end_relieved: (c) => [cabShot(11, { subs: [[1.0, c.why || 'GRANITE\u2019s officers come aboard at the refuelling stop.', ''], [5.2, 'You are relieved of command. Someone else will decide what dawn looks like.', '']],
    cam: (T, u) => [LV(V3(0.55, 0.35, 2.6), V3(0, 1.0, 6.8), ease(u)), LV(V3(-1.6, 0.05, 0.35), V3(0, -0.2, -5), ease(u))], update: (T, u, st, cin) => { cin.ui.cabDim = 0.8 * u; } })],
};

export class Cinema {
  constructor(stage, audio, el) { this.s = stage; this.A = audio; this.el = el; this.active = false; this.ui = {}; this.flags = new Set(); }
  f(k) { if (this.flags.has(k + this.si)) return true; this.flags.add(k + this.si); return false; }
  play(key, ctx = {}) {
    const mk = FILMS[key]; if (!mk) return Promise.resolve();
    this.shots = mk(ctx); this.si = (ctx.from || 0) - 1; this.T = 0; this.active = true; this.key = key; this.flags.clear(); this.subsShown = new Set();
    this.el.root.hidden = false; this.el.root.classList.add('on'); this.el.title.textContent = ''; this.el.title.classList.remove('on'); this.el.sub.textContent = ''; this.el.sub.className = 'csub';
    this.next(); return new Promise(res => (this.res = res));
  }
  next() {
    const st = this.s; this.si++; this.T = 0;
    if (this.si >= this.shots.length) return this.end();
    const sh = this.shots[this.si]; this.ui = { mode: sh.mode, noLabels: true, tac: 0.25, alert: !!sh.alert };
    if (sh.dawn !== undefined) this.ui.dawn = sh.dawn; if (sh.cover !== undefined) this.ui.cover = sh.cover;
    st.cine.dof = sh.dof; st.cine.focusY = sh.focusY; st.cine.letter = 1; st.cine.grain = 0.06;
    this.A && this.A.setMode(sh.mode);
    sh.start(st, this); this.el.fade.style.opacity = 1; requestAnimationFrame(() => (this.el.fade.style.opacity = 0));
    if (sh.title) { this.el.title.textContent = sh.title; this.el.title.classList.add('on'); } else this.el.title.classList.remove('on');
  }
  update(dt) {
    if (!this.active) return; const sh = this.shots[this.si]; this.T += dt; const u = Math.min(1, this.T / sh.dur);
    sh.update(u, this.T, this.s, this);
    for (let i = 0; i < sh.subs.length; i++) { const s = sh.subs[i], k = this.si + ':' + i; if (this.T >= s[0] && !this.subsShown.has(k)) { this.subsShown.add(k); this.el.sub.textContent = s[1]; this.el.sub.className = 'csub on ' + (s[2] || ''); if (s[2] === 'tty') this.A && this.A.S.teletype(10); else if (s[2] === 'who') this.A && this.A.S.chatter(); } }
    if (this.T >= sh.dur) this.next();
  }
  skip() { if (!this.active) return; this.A && this.A.klaxon(false); this.end(); }
  end() { if (!this.active) return; this.active = false; const st = this.s; st.cine.letter = 0; st.cine.dof = 0; st.cine.grain = 0.035; st.skyCam = null;
    this.el.root.classList.remove('on'); this.el.title.classList.remove('on'); this.el.sub.className = 'csub'; setTimeout(() => { if (!this.active) this.el.root.hidden = true; }, 600);
    const r = this.res; this.res = null; r && r(); }
}
