/* ==========================================================================
   LIVING CHESS — cine.js : the emotion director.
   Short (about 2-4 s), skippable, real-time cinematic close-ups of one
   character at a dramatic moment: FEAR, SORROW, DISMAY, RAGE, TRIUMPH,
   HOPE, RELIEF, DESPAIR (checkmate) and STALEMATE. Everything is rendered
   live in the existing three.js scene (no <video>, no video files, so it
   keeps playing where browsers pause video, e.g. a Tesla in Drive):
     camera  — a styled move per emotion (push-in with handheld shake,
               high slow push, dolly zoom, low heroic orbit, crane up, snap
               zoom with drum-hit shakes, pull back, descending orbit)
     light   — the room dims; a coloured key spot, a rim light from the
               threat, a soft volumetric beam
     grade   — saturation / contrast / lift-gain / grain in the post pass
               (or a CSS colour layer on tiers without post), vignette
     body    — trembling, cowering, slumping, kneeling, rising, fists
     fx      — tears, sweat, embers, gold motes, ash, dust, sparks
     frame   — letterbox bars, title card, a spoken line, a scored stinger
   The director only reads the board; it never changes the game. Incoming
   moves cut a scene short, and any tap / key / gamepad button skips it.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';

const LC = window.LC;
const V3 = THREE.Vector3;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = t => 1 - Math.pow(1 - cl(t), 3);
const easeIO = t => { t = cl(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const rnd = (a, b) => a + Math.random() * (b - a);
const sqW = (s, y = 0) => new V3((s & 7) - 3.5, y, 3.5 - (s >> 3));
const TN = { 1: 'PAWN', 2: 'KNIGHT', 3: 'BISHOP', 4: 'ROOK', 5: 'QUEEN', 6: 'KING' };
const Tn = { 1: 'Pawn', 2: 'Knight', 3: 'Bishop', 4: 'Rook', 5: 'Queen', 6: 'King' };
const DEG = Math.PI / 180;
const VOICE_EMO = { fear: 'terror', sadness: 'grief', dismay: 'horror', triumph: 'joy', hope: 'longing', rage: 'resolve', relief: 'calm', despair: 'grief', stalemate: 'calm' };

/* ---------- the look of each emotion ---------- */
const ST = {
  fear:      { dur: [2.0, 3.0], col: '#8fb8ff', grade: { sat: 0.5, con: 1.25, gain: [0.78, 0.9, 1.28], lift: [0, 0.01, 0.03], grain: 0.07, css: 'rgba(30,80,190,0.42)', blend: 'color', exp: 0.85 }, dim: 0.62, spot: { c: 0xbfd6ff, i: 26, a: 0.34 }, rim: { c: 0xff2a14, i: 7 }, cam: 'pushShake', sting: 'fear' },
  sadness:   { dur: [2.2, 3.6], col: '#8aa0ff', grade: { sat: 0.42, con: 1.05, gain: [0.8, 0.88, 1.18], lift: [0, 0, 0.02], grain: 0.05, css: 'rgba(50,60,150,0.45)', blend: 'color', exp: 0.8 }, dim: 0.6, spot: { c: 0xaab8ff, i: 22, a: 0.3 }, rim: { c: 0x4060ff, i: 3 }, beam: { c: [0.45, 0.55, 1], op: 0.5 }, cam: 'highSlow', sting: 'sadness' },
  dismay:    { dur: [2.0, 3.2], col: '#e0e0f0', grade: { sat: 0.28, con: 1.35, gain: [1, 0.94, 0.88], lift: [0, 0, 0], grain: 0.08, css: 'rgba(90,90,100,0.5)', blend: 'color', exp: 0.9 }, dim: 0.55, spot: { c: 0xffffff, i: 28, a: 0.3 }, rim: { c: 0xffffff, i: 2 }, cam: 'dollyZoom', sting: 'dismay', flash: [1, 1, 1, 0.55] },
  triumph:   { dur: [2.2, 3.4], col: '#ffc83a', grade: { sat: 1.25, con: 1.15, gain: [1.28, 1.06, 0.78], lift: [0.02, 0.01, 0], grain: 0.03, css: 'rgba(255,170,40,0.3)', blend: 'soft-light', exp: 1.2 }, dim: 0.35, spot: { c: 0xffd890, i: 30, a: 0.36 }, rim: { c: 0xffa040, i: 5 }, beam: { c: [1, 0.8, 0.4], op: 0.9 }, cam: 'lowOrbit', sting: 'triumph', flash: [1, 0.9, 0.6, 0.35] },
  hope:      { dur: [2.2, 3.4], col: '#ffb59a', grade: { sat: 1.08, con: 1.0, gain: [1.16, 1.0, 0.95], lift: [0.02, 0.01, 0.02], grain: 0.03, css: 'rgba(255,160,150,0.26)', blend: 'soft-light', exp: 1.1 }, dim: 0.4, spot: { c: 0xffd0b8, i: 22, a: 0.4 }, rim: { c: 0xffc890, i: 4 }, beam: { c: [1, 0.75, 0.65], op: 0.7 }, cam: 'craneUp', sting: 'hope' },
  rage:      { dur: [1.9, 3.0], col: '#ff4a1c', grade: { sat: 1.15, con: 1.4, gain: [1.4, 0.74, 0.58], lift: [0.03, 0, 0], grain: 0.09, css: 'rgba(210,30,10,0.36)', blend: 'color', exp: 1.05 }, dim: 0.55, spot: { c: 0xff7040, i: 20, a: 0.4 }, rim: { c: 0xff2000, i: 10 }, cam: 'snap', sting: 'rage' },
  relief:    { dur: [1.9, 2.8], col: '#9fe8c8', grade: { sat: 0.95, con: 1.0, gain: [1.1, 1.03, 0.96], lift: [0, 0, 0], grain: 0.03, css: 'rgba(255,215,160,0.22)', blend: 'soft-light', exp: 1.05 }, dim: 0.35, spot: { c: 0xffe8c8, i: 18, a: 0.42 }, rim: { c: 0x80ffd0, i: 2 }, cam: 'pullBack', sting: 'relief' },
  despair:   { dur: [1.8, 2.7], col: '#a898c0', grade: { sat: 0.12, con: 1.3, gain: [1, 0.92, 0.88], lift: [0, 0, 0], grain: 0.1, css: 'rgba(40,32,36,0.6)', blend: 'color', exp: 0.78 }, dim: 0.68, spot: { c: 0xe8eeff, i: 30, a: 0.26 }, rim: { c: 0x6040a0, i: 2 }, beam: { c: [0.8, 0.85, 1], op: 0.75 }, cam: 'descend', sting: 'despair' },
  stalemate: { dur: [2.4, 3.8], col: '#d0d0d0', grade: { sat: 0.05, con: 1.1, gain: [0.95, 0.97, 1.03], lift: [0, 0, 0], grain: 0.08, css: 'rgba(110,110,115,0.65)', blend: 'color', exp: 0.9 }, dim: 0.5, spot: { c: 0xf0f0ff, i: 22, a: 0.36 }, rim: { c: 0x8090a0, i: 2 }, cam: 'pullFar', sting: 'stalemate' },
};
export const EMOTIONS = Object.keys(ST);

/* ---------- camera moves: u = 0..1 through the shot -> distance, elevation, yaw offset, fov ---------- */
const CAM = {
  pushShake: (u, t) => ({ d: lerp(3.4, 2.0, easeOut(u * 1.4)), el: 0.42, yaw: 0.1 * u, fov: 36, shake: 0.012 + 0.012 * Math.abs(Math.sin(t * 7)) }),
  highSlow: u => ({ d: lerp(3.2, 2.2, easeIO(u)), el: lerp(0.85, 0.7, u), yaw: lerp(-0.15, 0.12, u), fov: 34 }),
  dollyZoom: u => { const f = lerp(28, 64, easeIO(u / 0.6)); return { d: 3.6 * Math.tan(14 * DEG) / Math.tan(f / 2 * DEG), el: 0.36, yaw: 0, fov: f }; },
  lowOrbit: u => ({ d: lerp(2.9, 2.3, easeOut(u)), el: lerp(0.14, 0.24, u), yaw: lerp(-0.45, 0.45, easeIO(u)), fov: 40, lookY: 0.08 }),
  craneUp: u => ({ d: lerp(2.2, 2.8, easeIO(u)), el: lerp(0.1, 0.6, easeIO(u)), yaw: lerp(0.3, -0.1, u), fov: 38, lookY: 0.12 * u }),
  snap: (u, t, L) => ({ d: u * L < 0.3 ? lerp(3.8, 1.9, easeOut(u * L / 0.3)) : lerp(1.9, 1.7, u), el: 0.3, yaw: 0.05 * Math.sin(t * 1.3), fov: 36 }),
  pullBack: u => ({ d: lerp(1.9, 2.9, easeIO(u)), el: lerp(0.38, 0.55, u), yaw: lerp(0.2, 0, u), fov: 36 }),
  descend: u => ({ d: lerp(4.2, 2.6, easeOut(u)), el: lerp(1.25, 0.5, easeIO(u)), yaw: lerp(0, 0.6, u), fov: 36 }),
  pullFar: u => ({ d: lerp(2.0, 6.5, easeIO(u)), el: lerp(0.45, 0.95, easeIO(u)), yaw: lerp(0, 0.5, u), fov: 36 }),
};

/* ---------- body language per emotion: u = 0..1, t = seconds ---------- */
function pose(emo, c, u, t, sc) {
  const ty = c.type, look = sc.threatW || null;
  switch (emo) {
    case 'fear': return { emo: 'terror', g: ty === 3 ? 'pray' : 'cower', sy: -0.07, lean: -0.22, trem: 0.03 + 0.015 * Math.sin(t * 9), look };
    case 'sadness': { const kn = easeIO((u - 0.3) / 0.45); return { emo: 'grief', g: kn > 0.5 ? 'kneel' : 'mourn', by: -0.1 * kn, sy: -0.05 - 0.07 * kn, lean: 0.32 * kn, pitch: 0.35, look }; }
    case 'dismay': { const rc = u < 0.18 ? Math.sin(u / 0.18 * Math.PI) : 0; return { emo: 'dismay', g: 'coverEyes', lean: -0.3 * rc - 0.05, sy: -0.05, trem: 0.02, by: 0.04 * rc, look }; }
    case 'triumph': { const r = easeOut(u * 1.6); return { emo: 'triumph', g: ty === 2 ? 'sword' : 'rise', by: 0.14 * r, grow: 1 + 0.07 * r, pitch: -0.25 * r, lean: -0.06 * r }; }
    case 'hope': { const r = easeIO(u); return { emo: 'hope', g: 'gaze', by: 0.04 * r, pitch: -0.3 * r, look: sc.goalW || null, point: sc.goalW || null }; }
    case 'rage': return { emo: 'rage', g: ty === 2 ? 'sword' : 'fists', sy: 0.03, grow: 1.04, lean: 0.15, trem: 0.02 + 0.03 * Math.max(0, Math.sin(t * 11)), look };
    case 'relief': { const ex = easeIO((u - 0.3) / 0.4); return { emo: u < 0.3 ? 'anxiety' : 'relief', g: u < 0.3 ? 'cower' : 'heart', sy: lerp(-0.05, 0, ex) - 0.04 * Math.sin(ex * Math.PI), by: -0.02 * Math.sin(ex * Math.PI), pitch: lerp(0.15, -0.12, ex), trem: u < 0.3 ? 0.015 : 0 }; }
    case 'despair': { const kn = easeIO(u / 0.5); return { emo: 'despair', g: 'kneel', by: -0.08 * kn, sy: -0.08 * kn, lean: 0.25 * kn, pitch: 0.45 }; }
    case 'stalemate': return { emo: 'dismay', inten: 0.6, g: 'kneel', pitch: 0.25, sy: -0.03 };
  }
  return null;
}

/* ---------- words ---------- */
const LINES = {
  fear: ['They have seen me.', 'Not here… not now.', 'I can feel their eyes on me.', 'Someone… cover me!'],
  'fear:check': ['They are coming for me!', 'Guards! To me!', 'The crown is in danger!'],
  'fear:pin': ['I cannot move. If I step aside, my King dies.', 'Chained to this square…'],
  'fear:fork': ['Two of us… and only one can escape.', 'A trap. Which of us will they take?'],
  sadness: ['Rest now, brave {v}.', 'I was right beside you.', 'Why… why you?'],
  dismay: ['The Queen… no. NO!', 'This cannot be happening.'],
  rage: ['You will pay for that.', 'For the {v}! I will avenge you!', 'Blood for blood.'],
  triumph: ['For the army!', 'Their {v} is no more!', 'Who is next?'],
  'triumph:promo': ['I rise… as a {p}!', 'A pawn no longer!'],
  'triumph:mate': ['Checkmate. It is finished.', 'Victory!'],
  'triumph:win': ['Victory! Every one of us who fell, fell for this.'],
  hope: ['I can see the last rank…', 'Just a few more steps.', 'One day… a crown.'],
  relief: ['Safe… for now.', 'That was too close.', 'Breathe. Just breathe.'],
  despair: ['It is over.', 'Forgive me… I could not escape.'],
  'sadness:loss': ['We lay down our arms.'],
  stalemate: ['No way forward. No way back.', 'Neither victory nor defeat.'],
};
let lineN = 0;
function lineFor(emo, tag, o) { let L = LINES[emo + ':' + tag] || LINES[emo] || ['…']; if (!o.v) { const f = L.filter(x => x.indexOf('{v}') < 0); if (f.length) L = f; } return L[(lineN++) % L.length].replace('{v}', o.v || 'friend').replace('{p}', o.p || 'Queen'); }

export class Cine {
  /**
   * @param R  Board3D   @param A LCAudio
   * @param o  { root: #cine element, say(id, type, text, emo), onStart(), onEnd() }
   */
  constructor(R, A, o = {}) {
    this.R = R; this.A = A; this.o = o; this.mode = 'full'; this.active = null; this.lastEnd = -1e9;
    this.coolPiece = new Map(); this.coolEmo = new Map(); this.log = []; this.waiters = [];
    const q = s => o.root && o.root.querySelector(s);
    this.dom = { root: o.root, grade: q('.cgrade'), vig: q('.cvig'), who: q('.cwho'), word: q('.cword'), line: q('.cline'), skip: q('.cskip') };
    this.g = { sat: 1, con: 1, gain: [1, 1, 1], lift: [0, 0, 0], grain: 0 };
    this._v = new V3(); this._v2 = new V3();
  }
  setMode(m) { this.mode = m === 'off' || m === 'short' ? m : 'full'; if (this.mode === 'off') this.cut(true); }
  now() { return performance.now() / 1000; }
  /** pick the most dramatic candidate, respecting the throttle; plays it (returns the promise) or returns null */
  consider(cands, o = {}) {
    if (this.mode === 'off' || !cands || !cands.length || this.active) return null;
    const now = this.now(); let best = null;
    for (const c of cands) {
      if (c.id == null || c.id < 0) continue;
      const p = c.prio + (c.side === o.me ? 10 : 0), key = c.id + ':' + c.emo + ':' + (c.tag || '');
      if (p < 75 && now - (this.coolPiece.get(key) || -1e9) < 40) continue;
      if (p < 75 && now - (this.coolEmo.get(c.emo) || -1e9) < 14) continue;
      if (!best || p > best.p) best = Object.assign({}, c, { p });
    }
    if (!best || best.p < 45) return null;
    const gap = this.mode === 'short' || o.short ? 11 : 7;
    if (best.p < 75 && now - this.lastEnd < gap) return null;
    return this.play(best, o);
  }
  /** play a scene. spec: { emo, sq | id, threat, goal, tag, word, victim, me } or { emo: 'checkmate', kingSq, mateSq, winner } */
  play(spec, o = {}) {
    if (this.mode === 'off' && !o.force) return null;
    if (this.active) this.cut(true);
    const R = this.R, short = this.mode === 'short' || o.short, me = o.me != null ? o.me : spec.me;
    const charAt = sq => sq != null ? R.charAt(sq) : null;
    const shots = [];
    const mk = (emo, c, extra = {}) => { const st = ST[emo]; return Object.assign({ emo, st, c, dur: st.dur[short ? 0 : 1] }, extra); };
    if (spec.emo === 'checkmate') {
      const k = charAt(spec.kingSq), m = charAt(spec.mateSq); if (!k) return null;
      shots.push(mk('despair', k, { dur: short ? 1.7 : 2.6, tag: 'mate', sting: 'despair' }));
      if (m) shots.push(mk('triumph', m, { dur: short ? 1.5 : 2.2, tag: 'mate', sting: 'triumph', big: true, cutIn: true }));
    } else {
      const st = ST[spec.emo]; if (!st) return null;
      const c = spec.id != null ? R.chars.get(spec.id) : charAt(spec.sq); if (!c || !c.alive) return null;
      shots.push(mk(spec.emo, c, { tag: spec.tag, sting: st.sting }));
      if (spec.emo === 'stalemate' && spec.otherSq != null) shots[0].other = charAt(spec.otherSq);
    }
    for (const s of shots) {
      s.threatW = spec.threat != null && s === shots[0] ? sqW(spec.threat, 0.6) : null;
      s.goalW = spec.goal != null ? sqW(spec.goal, 1.6) : null;
      s.frame = this.frameShot(s);
    }
    const total = shots.reduce((a, s) => a + s.dur, 0);
    const sc = this.active = { spec, shots, total, t: 0, i: -1, ending: false, endAt: total - 0.45, outDur: 0.45, short, me, fx: {}, keepShot: spec.emo === 'checkmate' };
    sc.promise = new Promise(res => { sc.resolve = res; });
    this.coolPiece.set(spec.id + ':' + spec.emo + ':' + (spec.tag || ''), this.now()); this.coolEmo.set(spec.emo, this.now());
    // stage
    const d = this.dom; if (d.root) { d.root.classList.toggle('short', !!short); d.root.classList.remove('hidden'); void d.root.offsetWidth; d.root.classList.add('on'); }
    this.o.onStart && this.o.onStart(sc);
    if (spec.emo === 'checkmate') R.mateSeq(spec.kingSq, 1 - spec.winner, spec.winner, { noCam: true, noSfx: true });
    this.log.push({ emo: spec.emo, tag: spec.tag || shots[0].tag || null, type: shots[0].c.type, side: shots[0].c.side, id: shots[0].c.id, shots: shots.map(s => s.emo), mode: short ? 'short' : 'full', total: +total.toFixed(2), at: Math.round(performance.now()) });
    this.enterShot(0);
    return sc.promise;
  }
  /** choose a yaw (and lift) that keeps the subject visible: other pieces must not stand between camera and face */
  frameShot(s) {
    const R = this.R, c = s.c, P = c.root.position.clone(), h = c.height || 1, cam = CAM[s.st.cam];
    const scale = (0.8 + 0.2 * h) * (R.portrait ? 1.28 : 1);
    const best = { yaw: 0, el: 0, n: 1e9 };
    const sgn = R.orient ? -1 : 1;
    const look = P.clone(); look.y = h * 0.72;
    const occl = (yaw0, el0) => {
      let n = 0;
      for (const u of [0.5, 1]) {
        const f = cam(u, u * s.dur, s.dur), pos = this.camPos(look, f.d * scale, f.el + el0, yaw0 + f.yaw, sgn);
        for (const o of R.chars.values()) {
          if (!o.alive || o === c || o === s.other || !o.root.visible) continue;
          const ox = o.root.position.x, oz = o.root.position.z, dx = pos.x - look.x, dz = pos.z - look.z, L2 = dx * dx + dz * dz || 1e-6;
          const k = cl(((ox - look.x) * dx + (oz - look.z) * dz) / L2, 0, 1); if (k < 0.02) continue;
          const px = look.x + dx * k, pz = look.z + dz * k; if (Math.hypot(ox - px, oz - pz) > 0.34) continue;
          if (look.y + (pos.y - look.y) * k < (o.height || 1) + 0.06) n++;
        }
      }
      return n;
    };
    for (const el0 of [0, 0.22, 0.45]) {
      for (const yaw of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2]) { const n = occl(yaw, el0); if (n < best.n) { best.n = n; best.yaw = yaw; best.el = el0; } if (n === 0) break; }
      if (best.n === 0) break;
    }
    return { P, h, look, scale, yaw0: best.yaw, el0: best.el, sgn, occluded: best.n };
  }
  camPos(look, d, el, yaw, sgn, out = new V3()) { return out.set(look.x + Math.sin(yaw) * d * Math.cos(el) * sgn, look.y + Math.sin(el) * d, look.z + Math.cos(yaw) * d * Math.cos(el) * sgn); }
  enterShot(i) {
    const sc = this.active, s = sc.shots[i], R = this.R, A = this.A; sc.i = i; sc.shotT0 = sc.shots.slice(0, i).reduce((a, x) => a + x.dur, 0);
    const c = s.c; if (s.prevPointW === undefined) s.prevPointW = c.pointW;
    for (const x of sc.shots) if (x !== s && x.c.cine && x.c !== c) { /* earlier subject keeps its last pose */ }
    // camera
    const f = CAM[s.st.cam](0, 0, s.dur), pos = this.camPos(s.frame.look, f.d * s.frame.scale, f.el + s.frame.el0, s.frame.yaw0 + f.yaw, s.frame.sgn);
    if (!R.camShot || !R.camShot.cine) R.camShot = { pos: pos.clone(), look: s.frame.look.clone(), t: 0, hold: 1e9, k: 3.2, orbit: 0, focus: 1, cine: true };
    else { R.camShot.pos.copy(pos); R.camShot.look.copy(s.frame.look); }
    if (s.cutIn) { R.camCur.pos.copy(pos); R.camCur.look.copy(s.frame.look); }
    // title card + words
    const d = this.dom, side = c.side, mine = sc.me != null && side === sc.me;
    const word = i === 0 && sc.spec.word ? sc.spec.word : ({ despair: 'CHECKMATE', triumph: s.tag === 'mate' ? 'VICTORY' : 'TRIUMPH', sadness: 'SORROW', stalemate: sc.spec.word || 'STALEMATE' })[s.emo] || s.emo.toUpperCase();
    const who = (sc.me == null ? (side ? 'THE BLACK ' : 'THE WHITE ') : mine ? 'YOUR ' : 'ENEMY ') + TN[c.type];
    s.text = lineFor(s.emo, s.tag || sc.spec.tag, { v: sc.spec.victim ? Tn[sc.spec.victim] : null, p: Tn[c.type] });
    if (d.root) {
      d.root.style.setProperty('--cc', s.st.col);
      d.word.classList.remove('show'); d.who.classList.remove('show'); d.line.classList.remove('show');
      d.word.textContent = word; d.who.textContent = who; d.line.textContent = '“' + s.text + '”';
      clearTimeout(this._capT); clearTimeout(this._lineT);
      this._capT = setTimeout(() => { if (this.active === sc && sc.i === i && !sc.ending) { d.word.classList.add('show'); d.who.classList.add('show'); } }, (i === 0 ? 300 : 120));
      this._lineT = setTimeout(() => { if (this.active === sc && sc.i === i && !sc.ending) d.line.classList.add('show'); }, (i === 0 ? 750 : 450));
      if (d.grade) { d.grade.style.background = s.st.grade.css; d.grade.style.mixBlendMode = s.st.grade.blend; }
    }
    // sound + voice
    A.stinger && A.stinger(s.sting || s.st.sting, s.dur + (i === sc.shots.length - 1 ? 0.2 : 0), { big: s.big });
    if (!sc.short && this.o.say) setTimeout(() => { if (this.active === sc && sc.i === i && !sc.ending) this.o.say(c.id, c.type, s.text, VOICE_EMO[s.emo] || 'calm'); }, i === 0 ? 450 : 250);
    // light accents
    if (s.st.flash) { R.flash = s.st.flash[3]; R.flashColor = new THREE.Color(s.st.flash[0], s.st.flash[1], s.st.flash[2]); }
    if (s.emo === 'triumph') { R.burst(c.root.position.clone().setY(c.height * 0.6), [2.6, 1.9, 0.6], Math.round(70 * this.q()), 2.2, 1.0, 0.07); R.flashLight(c.root.position.clone().setY(1.2), 0xffd080, 10, 0.5); }
    if (s.emo === 'dismay') { R.dust4(c.root.position); for (let k = 0; k < 40 * this.q(); k++) { const a = rnd(0, 6.28); R.cineFx.add({ x: c.root.position.x, y: 0.04, z: c.root.position.z, vx: Math.cos(a) * rnd(0.8, 1.8), vy: rnd(0.1, 0.5), vz: Math.sin(a) * rnd(0.8, 1.8), g: -0.4, drag: 0.15, life: rnd(1, 1.6), r: 0.55, gC: 0.52, b: 0.5, a: 0.55, s: rnd(0.1, 0.18), grow: 1.5 }); } R.shake = Math.max(R.shake, 0.05); }
    if (s.emo === 'rage') R.shake = Math.max(R.shake, 0.06);
    s.beats = s.emo === 'rage' ? [0, 0.32, 0.56, 0.74, 0.88, 1.0, 1.5, 2.0, 2.5].filter(b => b < s.dur) : [];
  }
  q() { const t = this.R.tier; return t >= 2 ? 1 : t === 1 ? 0.7 : 0.45; }
  /** skip with a short fade (tap / key / gamepad) */
  skip() { const sc = this.active; if (!sc) return false; if (!sc.ending || sc.t < sc.endAt) { sc.ending = true; sc.endAt = sc.t; sc.outDur = 0.28; sc.skipped = true; sc.skipFrames = 0; sc.skipMs = performance.now(); this.A.stingerStop && this.A.stingerStop(0.3); const l = this.log[this.log.length - 1]; if (l) l.skipped = true; } return true; }
  /** a move arrived: get out of the way (immediate = no fade) */
  cut(immediate) { const sc = this.active; if (!sc) return; if (immediate) { this.A.stingerStop && this.A.stingerStop(0.1); this.finish(); } else { this.skip(); sc.outDur = 0.15; } }
  resetThrottle() { this.coolPiece.clear(); this.coolEmo.clear(); this.lastEnd = -1e9; }
  idle() { return this.active ? this.active.promise : Promise.resolve(); }
  update(dt) {
    const sc = this.active; if (!sc) return;
    // scene time runs on the wall clock, but one long hitch (shader compile, tab switch) advances it by at most 0.5 s so it cannot swallow the scene; motion smoothing still uses dt
    const nowMs = performance.now(), raw = (sc.lastMs ? (nowMs - sc.lastMs) / 1000 : dt) / (this.o.timeScale || 1), dtw = Math.min(0.5, raw); sc.lost = (sc.lost || 0) + raw - dtw; if (sc.skipFrames != null) sc.skipFrames++; sc.t += dtw; sc.lastMs = nowMs;
    const t = sc.t, R = this.R;
    if (!sc.ending && t >= sc.endAt) sc.ending = true;
    if (sc.ending && t >= sc.endAt + sc.outDur) { this.finish(); return; }
    // which shot
    let i = 0, acc = 0; for (; i < sc.shots.length - 1; i++) { if (t < acc + sc.shots[i].dur) break; acc += sc.shots[i].dur; }
    if (i !== sc.i && !sc.ending) this.enterShot(i);
    const s = sc.shots[sc.i], lt = t - sc.shotT0, u = cl(lt / s.dur), st = s.st;
    const e = cl(t / 0.35) * (sc.ending ? 1 - cl((t - sc.endAt) / sc.outDur) : 1);
    sc.e = e;
    // camera
    const f = CAM[st.cam](u, lt, s.dur), F = s.frame;
    const look = this._v.copy(F.look); if (f.lookY) look.y += f.lookY;
    if (s.emo === 'stalemate' && s.other) look.lerp(s.other.root.position.clone().setY(F.look.y), 0.5 * easeIO(u));
    const pos = this.camPos(look, f.d * F.scale, f.el + F.el0, F.yaw0 + f.yaw, F.sgn, this._v2);
    if (f.shake) { pos.x += rnd(-1, 1) * f.shake; pos.y += rnd(-1, 1) * f.shake; }
    for (const b of s.beats) if (lt >= b && lt - dt < b) { R.shake = Math.max(R.shake, 0.07); R.burst(s.c.root.position.clone().setY(s.c.height * 0.55), [3, 1.1, 0.25], Math.round(28 * this.q()), 2.6, 0.5, 0.06); R.flashLight(s.c.root.position.clone().setY(0.8), 0xff5020, 9, 0.18); }
    if (R.camShot && R.camShot.cine) { // the director drives the camera itself, on the wall clock
      R.camShot.pos.copy(pos); R.camShot.look.copy(look); R.camShot.k = 0;
      const kk = 1 - Math.exp(-(lt < 0.45 && !s.cutIn ? 3.2 : 7) * dtw); R.camCur.pos.lerp(pos, kk); R.camCur.look.lerp(look, kk); }
    const fov = lerp(36, f.fov || 36, sc.ending ? e : 1);
    if (Math.abs(R.cam.fov - fov) > 0.01) { R.cam.fov = fov; R.cam.updateProjectionMatrix(); }
    // body
    const p = pose(s.emo, s.c, u, lt, s);
    if (p) { p.k = e; s.c.cine = p; if (p.point) s.c.pointW = p.point; }
    if (s.other) s.other.cine = Object.assign(pose('stalemate', s.other, u, lt, s), { emo: 'anxiety', inten: 0.7, k: e });
    // light
    const BL = R.baseLights, dim = st.dim * e;
    R.key.intensity = BL.key * (1 - dim); R.hemi.intensity = BL.hemi * (1 - dim * 0.9); R.rimA.intensity = BL.rimA * (1 - dim * 0.8); R.rimB.intensity = BL.rimB * (1 - dim * 0.8); R.front.intensity = BL.front * (1 - dim);
    R.r.toneMappingExposure = BL.exp * lerp(1, st.grade.exp, e);
    const P = s.c.root.position, h = s.c.height || 1;
    const toCam = this._tc || (this._tc = new V3()); toCam.copy(R.cam.position).sub(P).setY(0).normalize();
    R.cineSpot.color.setHex(st.spot.c); R.cineSpot.angle = st.spot.a; R.cineSpot.position.set(P.x + toCam.x * 1.3, 4.2, P.z + toCam.z * 1.3); R.cineSpot.target.position.set(P.x, h * 0.55, P.z); R.cineSpot.target.updateMatrixWorld();
    R.cineSpot.intensity = st.spot.i * e * (s.emo === 'rage' ? 0.85 + 0.15 * Math.sin(lt * 23) : 1);
    if (st.rim) { R.cineRim.color.setHex(st.rim.c); if (s.threatW) R.cineRim.position.set(lerp(P.x, s.threatW.x, 0.6), 0.9, lerp(P.z, s.threatW.z, 0.6)); else R.cineRim.position.set(P.x - toCam.x * 1.2, h + 0.3, P.z - toCam.z * 1.2); R.cineRim.intensity = st.rim.i * e * (s.emo === 'rage' ? 0.7 + 0.3 * Math.sin(lt * 17) : 1); }
    if (st.beam) { R.beam.visible = e > 0.01; R.beam.position.set(P.x, 2.1, P.z); R.beam.material.uniforms.col.value.setRGB(st.beam.c[0], st.beam.c[1], st.beam.c[2]); R.beam.material.uniforms.op.value = st.beam.op * e * (s.emo === 'hope' ? easeIO(u * 1.5) : 1); }
    else R.beam.visible = false;
    // grade: post pass on tiers 2-3, a CSS colour layer otherwise; vignette everywhere
    const G = st.grade, g = this.g, k = Math.min(1, dt * 6);
    g.sat = lerp(g.sat, G.sat, k); g.con = lerp(g.con, G.con, k); g.grain = lerp(g.grain, G.grain, k); for (let j = 0; j < 3; j++) { g.gain[j] = lerp(g.gain[j], G.gain[j], k); g.lift[j] = lerp(g.lift[j], G.lift[j], k); }
    if (R.focusPass) { const U = R.focusPass.uniforms; U.sat.value = lerp(1, g.sat, e); U.con.value = lerp(1, g.con, e); U.grain.value = g.grain * e; U.gain.value.setRGB(lerp(1, g.gain[0], e), lerp(1, g.gain[1], e), lerp(1, g.gain[2], e)); U.lift.value.setRGB(g.lift[0] * e, g.lift[1] * e, g.lift[2] * e); U.vig.value = 0.35 + 0.45 * e; }
    const d = this.dom; if (d.grade) d.grade.style.opacity = R.tier >= 2 ? '0' : String(e.toFixed(3)); if (d.vig) d.vig.style.opacity = String((e * (R.tier >= 2 ? 0.55 : 1)).toFixed(3));
    if (sc.ending && d.root && d.root.classList.contains('on') && t >= sc.endAt) { d.root.classList.remove('on'); d.word.classList.remove('show'); d.who.classList.remove('show'); d.line.classList.remove('show'); }
    // particles
    this.emit(s, lt, u, Math.min(0.1, Math.max(dt, dtw)), e);
  }
  emit(s, lt, u, dt, e) {
    const R = this.R, c = s.c, P = c.root.position, h = c.height || 1, q = this.q() * e, fx = this.active.fx;
    const every = (key, period, fn) => { fx[key] = (fx[key] || 0) + dt; while (fx[key] >= period) { fx[key] -= period; fn(); } };
    const rate = (key, perSec, fn) => { if (perSec * q <= 0) return; every(key, 1 / (perSec * q), fn); };
    const head = c.head ? c.head.getWorldPosition(this._hp || (this._hp = new V3())) : P.clone().setY(h);
    const right = (this._rt || (this._rt = new V3())).setFromMatrixColumn(R.cam.matrixWorld, 0).setY(0).normalize();
    const fwd = (this._fw || (this._fw = new V3())).copy(R.cam.position).sub(head).setY(0).normalize();
    const hr = (c.spec && c.spec.head ? c.spec.head.r : 0.15) * (c.spec ? c.spec.scale : 1);
    switch (s.emo) {
      case 'fear':
        rate('sweat', 5, () => { const sd = Math.random() < 0.5 ? -1 : 1; R.sparks.add({ x: head.x + right.x * hr * sd + fwd.x * hr * 0.6, y: head.y + hr * 0.5, z: head.z + right.z * hr * sd + fwd.z * hr * 0.6, vx: right.x * sd * rnd(0.6, 1.2), vy: rnd(0.4, 0.9), vz: right.z * sd * rnd(0.6, 1.2), g: -6, drag: 0.8, life: 0.6, r: 0.6, gC: 0.85, b: 1.4, s: 0.03 }); });
        rate('dust', 16, () => R.cineFx.add({ x: P.x + rnd(-1.5, 1.5), y: rnd(1.8, 3), z: P.z + rnd(-1.5, 1.5), vx: rnd(-0.05, 0.05), vy: rnd(-0.3, -0.1), vz: rnd(-0.05, 0.05), g: 0, drag: 1, life: 2.2, r: 0.6, gC: 0.65, b: 0.75, a: 0.5, s: rnd(0.025, 0.05), fade: 'in' }));
        break;
      case 'sadness':
        if (u > 0.12) rate('tear', 9, () => { const sd = Math.random() < 0.5 ? -1 : 1; R.sparks.add({ x: head.x + right.x * hr * 0.38 * sd + fwd.x * hr * 0.92, y: head.y + hr * 0.05, z: head.z + right.z * hr * 0.38 * sd + fwd.z * hr * 0.92, vx: fwd.x * 0.05, vy: -0.05, vz: fwd.z * 0.05, g: -2.4, drag: 0.95, life: 1.1, r: 0.7, gC: 0.9, b: 1.8, s: 0.028 }); });
        rate('rain', 26, () => R.cineFx.add({ x: P.x + rnd(-2, 2), y: rnd(2.2, 3.4), z: P.z + rnd(-2, 2), vx: 0, vy: rnd(-1.6, -1.1), vz: 0, g: -0.4, drag: 1, life: 2.2, r: 0.5, gC: 0.56, b: 0.8, a: 0.45, s: rnd(0.02, 0.035) }));
        break;
      case 'dismay':
        rate('ash', 14, () => R.cineFx.add({ x: P.x + rnd(-1.6, 1.6), y: rnd(2, 3), z: P.z + rnd(-1.6, 1.6), vx: rnd(-0.1, 0.1), vy: rnd(-0.35, -0.15), vz: rnd(-0.1, 0.1), g: 0, drag: 1, life: 2.4, r: 0.75, gC: 0.75, b: 0.8, a: 0.55, s: rnd(0.03, 0.06), fade: 'in' }));
        break;
      case 'triumph':
        rate('ember', 55, () => { const a = rnd(0, 6.28), r = rnd(0.2, 0.75); R.sparks.add({ x: P.x + Math.cos(a) * r, y: rnd(0.05, 0.6), z: P.z + Math.sin(a) * r, vx: rnd(-0.15, 0.15), vy: rnd(0.6, 1.6), vz: rnd(-0.15, 0.15), g: 0.2, drag: 0.7, life: rnd(1.2, 1.9), r: 2.4, gC: 1.6, b: 0.5, s: rnd(0.04, 0.085), fade: 'in' }); });
        if (s.tag === 'mate' || s.big) rate('confetti', 18, () => R.sparks.add({ x: P.x + rnd(-2, 2), y: rnd(2.5, 3.5), z: P.z + rnd(-2, 2), vx: rnd(-0.2, 0.2), vy: rnd(-0.6, -0.2), vz: rnd(-0.2, 0.2), g: -0.3, drag: 0.9, life: 2.4, r: rnd(1, 2.6), gC: rnd(0.8, 2.2), b: rnd(0.3, 1.6), s: rnd(0.04, 0.07) }));
        break;
      case 'hope':
        rate('mote', 30, () => { const a = rnd(0, 6.28), r = rnd(0.3, 2.0); R.sparks.add({ x: P.x + Math.cos(a) * r, y: rnd(0.1, 1.4), z: P.z + Math.sin(a) * r, vx: rnd(-0.08, 0.08), vy: rnd(0.15, 0.5), vz: rnd(-0.08, 0.08), g: 0.05, drag: 0.9, life: rnd(1.6, 2.6), r: 2.0, gC: 1.45, b: 1.1, s: rnd(0.03, 0.06), fade: 'in' }); });
        break;
      case 'rage':
        rate('ember', 70, () => { const a = rnd(0, 6.28), r = rnd(0.15, 0.6); R.sparks.add({ x: P.x + Math.cos(a) * r, y: rnd(0.05, 0.4), z: P.z + Math.sin(a) * r, vx: Math.cos(a + 1.6) * rnd(0.3, 0.9), vy: rnd(1, 2.4), vz: Math.sin(a + 1.6) * rnd(0.3, 0.9), g: 0.5, drag: 0.6, life: rnd(0.7, 1.2), r: 2.6, gC: 0.7, b: 0.15, s: rnd(0.035, 0.07) }); });
        rate('soot', 20, () => R.cineFx.add({ x: P.x + rnd(-0.6, 0.6), y: rnd(0.1, 0.6), z: P.z + rnd(-0.6, 0.6), vx: rnd(-0.1, 0.1), vy: rnd(0.5, 1.1), vz: rnd(-0.1, 0.1), g: 0.1, drag: 0.8, life: 1.6, r: 0.08, gC: 0.04, b: 0.03, a: 0.6, s: rnd(0.06, 0.12), grow: 1.2 }));
        break;
      case 'relief':
        rate('settle', 18, () => R.cineFx.add({ x: P.x + rnd(-1.4, 1.4), y: rnd(1.2, 2.2), z: P.z + rnd(-1.4, 1.4), vx: rnd(-0.04, 0.04), vy: rnd(-0.2, -0.08), vz: rnd(-0.04, 0.04), g: 0, drag: 1, life: 2.4, r: 0.7, gC: 0.65, b: 0.55, a: 0.4, s: rnd(0.03, 0.05), fade: 'in' }));
        if (u > 0.3) rate('warm', 20, () => { const a = rnd(0, 6.28), r = rnd(0.2, 0.9); R.sparks.add({ x: P.x + Math.cos(a) * r, y: rnd(0.2, 1.1), z: P.z + Math.sin(a) * r, vx: 0, vy: rnd(0.1, 0.35), vz: 0, g: 0, drag: 0.9, life: 1.8, r: 1.6, gC: 1.3, b: 0.9, s: rnd(0.03, 0.05), fade: 'in' }); });
        break;
      case 'despair':
        rate('ash', 45, () => R.cineFx.add({ x: P.x + rnd(-2.4, 2.4), y: rnd(2.2, 3.6), z: P.z + rnd(-2.4, 2.4), vx: rnd(-0.15, 0.15), vy: rnd(-0.45, -0.2), vz: rnd(-0.15, 0.15), g: 0, drag: 1, life: 3, r: 0.12, gC: 0.11, b: 0.11, a: 0.8, s: rnd(0.05, 0.09), fade: 'in' }));
        rate('flake', 14, () => R.sparks.add({ x: P.x + rnd(-2, 2), y: rnd(2.2, 3.4), z: P.z + rnd(-2, 2), vx: rnd(-0.1, 0.1), vy: rnd(-0.4, -0.2), vz: rnd(-0.1, 0.1), g: 0, drag: 1, life: 2.6, r: 0.5, gC: 0.5, b: 0.56, s: rnd(0.03, 0.05), fade: 'in' }));
        break;
      case 'stalemate':
        if (u < 0.5) rate('frozen', 26, () => R.cineFx.add({ x: P.x + rnd(-2.5, 2.5), y: rnd(0.3, 2.4), z: P.z + rnd(-2.5, 2.5), vx: rnd(-0.01, 0.01), vy: rnd(-0.01, 0.01), vz: rnd(-0.01, 0.01), g: 0, drag: 1, life: 3.2, r: 0.75, gC: 0.75, b: 0.8, a: 0.5, s: rnd(0.025, 0.05), fade: 'in' }));
        break;
    }
  }
  finish() {
    const sc = this.active; if (!sc) return; this.active = null; const R = this.R;
    clearTimeout(this._capT); clearTimeout(this._lineT);
    for (const s of sc.shots) { if (s.c) { s.c.cine = null; if (s.prevPointW !== undefined) s.c.pointW = s.prevPointW; } if (s.other) s.other.cine = null; }
    const BL = R.baseLights; R.key.intensity = BL.key; R.hemi.intensity = BL.hemi; R.rimA.intensity = BL.rimA; R.rimB.intensity = BL.rimB; R.front.intensity = BL.front; R.r.toneMappingExposure = BL.exp;
    R.cineSpot.intensity = 0; R.cineRim.intensity = 0; R.beam.visible = false;
    if (R.focusPass) { const U = R.focusPass.uniforms; U.sat.value = 1; U.con.value = 1; U.grain.value = 0; U.gain.value.setRGB(1, 1, 1); U.lift.value.setRGB(0, 0, 0); U.vig.value = 0.35; }
    this.g = { sat: 1, con: 1, gain: [1, 1, 1], lift: [0, 0, 0], grain: 0 };
    if (R.cam.fov !== 36) { R.cam.fov = 36; R.cam.updateProjectionMatrix(); }
    if (R.camShot && R.camShot.cine) R.camShot = null;
    if (sc.keepShot) { const k = sc.shots[0].c; R.shot(k.root.position.clone(), { dist: 5, el: 0.5, hold: 99, k: 1.4, orbit: 0.25 }); }
    const d = this.dom; if (d.root) { d.root.classList.remove('on'); d.root.classList.add('hidden'); if (d.grade) d.grade.style.opacity = '0'; if (d.vig) d.vig.style.opacity = '0'; for (const k of ['word', 'who', 'line']) d[k] && d[k].classList.remove('show'); }
    this.lastEnd = this.now(); { const l = this.log[this.log.length - 1]; if (l && sc.skipFrames != null) { l.framesAfterSkip = sc.skipFrames; l.msAfterSkip = Math.round(performance.now() - sc.skipMs); } if (l) l.lost = +(sc.lost || 0).toFixed(2); if (l) l.ms = Math.round(performance.now() - l.at); }
    this.o.onEnd && this.o.onEnd(sc);
    sc.resolve({ skipped: !!sc.skipped });
  }
  state() { const sc = this.active; return { mode: this.mode, active: !!sc, emo: sc ? sc.spec.emo : null, shot: sc ? sc.shots[sc.i].emo : null, t: sc ? +sc.t.toFixed(2) : 0, total: sc ? sc.total : 0, e: sc ? +(sc.e || 0).toFixed(2) : 0, occluded: sc ? sc.shots[sc.i].frame.occluded : null, played: this.log.length }; }
}
