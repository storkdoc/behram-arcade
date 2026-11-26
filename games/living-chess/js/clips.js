/* ==========================================================================
   LIVING CHESS — clips.js : on-board emotion clips.
   Tiny AI-generated clips of OUR pieces (rendered from the game's own
   models, then animated), keyed and packed into WebP sprite atlases
   (clips/*.webp, listed in clips/manifest.js). When something dramatic
   happens the clip plays ON THE BOARD, on the piece's own square, as a
   camera-facing textured quad: the 3D piece hides while its clip plays and
   comes back afterwards, unless the clip is its death.
     demise   — a captured piece's end (melts, shatters, crumbles to dust,
                burns to ash, cracks and topples, turns to sand, lightning,
                freezes and splinters, sinks into its square), picked at
                random from the clips for that piece / side / square colour
     triumph  — the capturing piece celebrating on its destination square
     fear, sorrow, rage, hope, relief, dismay — from cine-detect.js
   No <video> element: frames are drawn as WebGL textures, so they keep
   playing where a browser pauses video (a Tesla in Drive). Atlases are
   ~100-200 KB each and load lazily the first time they are needed.
   Same public interface as the old cine.js director (consider / play /
   skip / cut / idle / update / state / log), so main.js barely changes.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';
import { CLIPS } from '../clips/manifest.js';

const LC = window.LC;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const TN = { 1: 'PAWN', 2: 'KNIGHT', 3: 'BISHOP', 4: 'ROOK', 5: 'QUEEN', 6: 'KING' };
const Tn = { 1: 'Pawn', 2: 'Knight', 3: 'Bishop', 4: 'Rook', 5: 'Queen', 6: 'King' };
const TL = { 1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };
const VOICE_EMO = { fear: 'terror', sadness: 'grief', dismay: 'horror', triumph: 'joy', hope: 'longing', rage: 'resolve', relief: 'calm', despair: 'grief', stalemate: 'calm', demise: 'grief' };
// which clip emotions can show a detected emotion, best first
const CLIP_FOR = { fear: ['fear'], sadness: ['sorrow', 'fear'], dismay: ['dismay', 'fear'], rage: ['rage'], triumph: ['triumph'], hope: ['hope', 'triumph'], relief: ['relief', 'triumph'], despair: ['demise'], demise: ['demise'], stalemate: ['sorrow', 'fear'] };
const WORD = { fear: 'FEAR', sadness: 'SORROW', dismay: 'DISMAY', rage: 'RAGE', triumph: 'TRIUMPH', hope: 'HOPE', relief: 'RELIEF', despair: 'CHECKMATE', demise: 'FALLEN', stalemate: 'STALEMATE' };
const COL = { fear: '#8fb8ff', sadness: '#8aa0ff', dismay: '#e0e0f0', rage: '#ff4a1c', triumph: '#ffc83a', hope: '#ffb59a', relief: '#9fe8c8', despair: '#a898c0', demise: '#c8b8e0', stalemate: '#d0d0d0' };
const STING = { demise: 'sadness', despair: 'despair' };
const LINES = {
  fear: ['They have seen me.', 'Not here… not now.', 'I can feel their eyes on me.', 'Someone… cover me!'],
  'fear:check': ['They are coming for me!', 'Guards! To me!', 'The crown is in danger!'],
  'fear:pin': ['I cannot move. If I step aside, my King dies.', 'Chained to this square…'],
  'fear:fork': ['Two of us… and only one can escape.', 'A trap. Which of us will they take?'],
  sadness: ['Rest now, brave {v}.', 'I was right beside you.', 'Why… why you?'],
  dismay: ['The Queen… no. NO!', 'This cannot be happening.'],
  rage: ['You will pay for that.', 'For the {v}! I will avenge you!', 'Blood for blood.'],
  triumph: ['For the army!', 'Their {v} is no more!', 'Who is next?', 'Ha! Too slow!', 'Did you see that?'],
  'triumph:promo': ['I rise… as a {p}!', 'A pawn no longer!'],
  'triumph:mate': ['Checkmate. It is finished.', 'Victory!'],
  'triumph:win': ['Victory! Every one of us who fell, fell for this.'],
  hope: ['I can see the last rank…', 'Just a few more steps.', 'One day… a crown.'],
  relief: ['Safe… for now.', 'That was too close.', 'Breathe. Just breathe.'],
  despair: ['It is over.', 'Forgive me… I could not escape.'],
  demise: ['No… not like this…', 'Remember me…', 'I tried…', 'Tell them I fought…'],
  'sadness:loss': ['We lay down our arms.'],
  stalemate: ['No way forward. No way back.', 'Neither victory nor defeat.'],
};
let lineN = 0;
function lineFor(emo, tag, o) { let L = LINES[emo + ':' + tag] || LINES[emo] || ['…']; if (!o.v) { const f = L.filter(x => x.indexOf('{v}') < 0); if (f.length) L = f; } return L[(lineN++) % L.length].replace('{v}', o.v || 'friend').replace('{p}', o.p || 'Queen'); }
export const EMOTIONS = Object.keys(CLIP_FOR);

/* clip geometry: every clip was generated from a still rendered with the same camera
   (distance 3.9 to a point 0.62 above the square, fov 36, then cropped to 0.78 of the width),
   so the frame spans 1.98 board squares and its centre sits 0.62 above the square. */
const QUAD_W = 1.98, QUAD_LIFT = 0.62;
const sqLight = sq => (((sq & 7) + (sq >> 3)) & 1) === 1;
export function clipList(type, side, light, emo) { return CLIPS.filter(c => c.t === TL[type] && c.side === side && c.light === light && c.e === emo); }

export class Cine {
  /**
   * @param R  Board3D   @param A LCAudio
   * @param o  { root: #cine element, say(id, type, text, emo), onStart(), onEnd(), base: url prefix for clips/ }
   */
  constructor(R, A, o = {}) {
    this.R = R; this.A = A; this.o = o; this.mode = 'full'; this.active = null; this.lastEnd = -1e9;
    this.coolPiece = new Map(); this.coolEmo = new Map(); this.log = []; this.lastPick = new Map();
    this.tex = new Map(); // file -> { img, tex, ready, failed, promise }
    const q = s => o.root && o.root.querySelector(s);
    this.dom = { root: o.root, who: q('.cwho'), word: q('.cword'), line: q('.cline') };
    this.base = o.base || 'clips/';
    // the quad: atlas frame via map offset/repeat, soft edges via a feathered alphaMap (its own uv transform)
    const fe = document.createElement('canvas'); fe.width = fe.height = 64; const x = fe.getContext('2d');
    const img = x.createImageData(64, 64);
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { const u = (i + 0.5) / 64, v = (j + 0.5) / 64, e = Math.min(u, 1 - u, v, 1 - v); const a = cl(e / 0.1); const k = (j * 64 + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * a * a * (3 - 2 * a)); img.data[k + 3] = 255; }
    x.putImageData(img, 0, 0);
    this.feather = new THREE.CanvasTexture(fe);
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false, alphaMap: this.feather, opacity: 0 });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat); this.quad.visible = false; this.quad.renderOrder = 20; this.quad.frustumCulled = false;
    R.scene.add(this.quad);
  }
  setMode(m) { this.mode = m === 'off' || m === 'short' ? m : 'full'; if (this.mode === 'off') this.cut(true); }
  now() { return performance.now() / 1000; }
  /** the atlas for one clip, loaded once and kept */
  load(c) {
    let t = this.tex.get(c.f); if (t) return t.promise;
    t = { ready: false, failed: false }; this.tex.set(c.f, t);
    t.promise = new Promise(res => {
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { const tx = new THREE.Texture(img); tx.colorSpace = THREE.SRGBColorSpace; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter; tx.repeat.set(1 / c.cols, 1 / c.rows); tx.needsUpdate = true; t.tex = tx; t.ready = true; res(t); };
      img.onerror = () => { t.failed = true; res(t); };
      img.src = this.base + c.f;
    });
    return t.promise;
  }
  /** a clip for this piece and emotion (random among the variants, avoiding the last one picked) */
  pick(c, emo) {
    if (!c) return null; const light = sqLight(c.sq);
    for (const e of CLIP_FOR[emo] || [emo]) {
      const L = clipList(c.type, c.side, light, e); if (!L.length) continue;
      const key = c.type + ':' + c.side + ':' + light + ':' + e, last = this.lastPick.get(key);
      const pool = L.length > 1 ? L.filter(x => x.f !== last) : L, p = pool[Math.floor(Math.random() * pool.length)];
      this.lastPick.set(key, p.f); return p;
    }
    return null;
  }
  has(c, emo) { return !!(c && (CLIP_FOR[emo] || [emo]).some(e => clipList(c.type, c.side, sqLight(c.sq), e).length)); }
  /** pick the most dramatic candidate, respecting the throttle; plays it (returns the promise) or returns null */
  consider(cands, o = {}) {
    if (this.mode === 'off' || !cands || !cands.length || this.active) return null;
    const now = this.now(); let best = null;
    for (const c of cands) {
      if (c.id == null || c.id < 0) continue;
      const ch = this.R.chars.get(c.id); if (!this.has(ch, c.emo)) continue;
      // the capturer always gets to celebrate (the user asked for it), so captures rank as big moments
      const cap = c.emo === 'triumph' && c.tag === 'capture';
      const p = c.prio + (c.side === o.me ? 10 : 0) + (cap ? 30 : 0), key = c.id + ':' + c.emo + ':' + (c.tag || '');
      if (p < 75 && now - (this.coolPiece.get(key) || -1e9) < 40) continue;
      if (p < 75 && now - (this.coolEmo.get(c.emo) || -1e9) < 14) continue;
      if (!best || p > best.p) best = Object.assign({}, c, { p });
    }
    if (!best || best.p < 45) return null;
    const gap = this.mode === 'short' || o.short ? 11 : 7;
    if (best.p < 75 && now - this.lastEnd < gap) return null;
    return this.play(best, o);
  }
  /** a captured piece's death on its own square; resolves when it is over (null = no clip, use the old shatter) */
  demise(vic, o = {}) {
    if (this.mode === 'off' || !vic || !this.has(vic, 'demise')) return null;
    return this.play({ emo: 'demise', id: vic.id, tag: 'capture', me: o.me }, Object.assign({ force: true, keepHidden: true }, o));
  }
  /** play clips. spec: { emo, sq | id, tag, word, victim, me } or { emo: 'checkmate', kingSq, mateSq, winner } */
  play(spec, o = {}) {
    if (this.mode === 'off' && !o.force) return null;
    if (this.active) this.cut(true);
    const R = this.R, short = this.mode === 'short' || o.short, me = o.me != null ? o.me : spec.me;
    const charAt = sq => sq != null ? R.charAt(sq) : null;
    const shots = [];
    const mk = (emo, c, extra = {}) => { const clip = this.pick(c, emo); return clip ? Object.assign({ emo, c, clip, keepHidden: emo === 'demise' || emo === 'despair' }, extra) : null; };
    if (spec.emo === 'checkmate') {
      const k = charAt(spec.kingSq), m = charAt(spec.mateSq); if (!k) return null;
      const a = mk('despair', k, { tag: 'mate' }); if (a) shots.push(a);
      const b = m && mk('triumph', m, { tag: 'mate' }); if (b) shots.push(b);
    } else {
      const c = spec.id != null ? R.chars.get(spec.id) : charAt(spec.sq); if (!c || !c.alive) return null;
      const s = mk(spec.emo, c, { tag: spec.tag }); if (s) { if (o.keepHidden) s.keepHidden = true; shots.push(s); }
    }
    if (!shots.length) return null;
    const rate = short ? 1.5 : 1; // Short plays the same clip faster
    for (const s of shots) s.dur = s.clip.n / s.clip.fps / rate;
    const total = shots.reduce((a, s) => a + s.dur, 0);
    const sc = this.active = { spec, shots, total, t: 0, i: -1, ending: false, endAt: total - 0.25, outDur: 0.25, short, me, rate, wait: 0 };
    sc.promise = new Promise(res => { sc.resolve = res; });
    this.coolPiece.set(spec.id + ':' + spec.emo + ':' + (spec.tag || ''), this.now()); this.coolEmo.set(spec.emo, this.now());
    const d = this.dom; if (d.root) { d.root.classList.add('clip'); d.root.classList.toggle('short', !!short); d.root.classList.remove('hidden'); void d.root.offsetWidth; d.root.classList.add('on'); }
    this.o.onStart && this.o.onStart(sc);
    if (spec.emo === 'checkmate') R.mateSeq(spec.kingSq, 1 - spec.winner, spec.winner, { noCam: true, noSfx: true });
    this.log.push({ emo: spec.emo, tag: spec.tag || shots[0].tag || null, type: shots[0].c.type, side: shots[0].c.side, id: shots[0].c.id, shots: shots.map(s => s.emo), clips: shots.map(s => s.clip.f), mode: short ? 'short' : 'full', total: +total.toFixed(2), at: Math.round(performance.now()) });
    for (const s of shots) this.load(s.clip);
    return sc.promise;
  }
  enterShot(i) {
    const sc = this.active, s = sc.shots[i], c = s.c, A = this.A; sc.i = i; sc.shotT0 = sc.shots.slice(0, i).reduce((a, x) => a + x.dur, 0);
    if (i > 0) { const p = sc.shots[i - 1]; if (!p.keepHidden && p.c.alive) p.c.root.visible = true; }
    s.sq = c.sq; s.P = c.root.position.clone(); s.P.y = 0;
    if (i > 0) { c.root.visible = false; s.hid = true; } // the first shot hides its piece once the clip has faded in
    const t = this.tex.get(s.clip.f); this.mat.map = t && t.tex; this.mat.needsUpdate = true;
    const d = this.dom, mine = sc.me != null && c.side === sc.me;
    const word = i === 0 && sc.spec.word ? sc.spec.word : s.tag === 'mate' && s.emo === 'triumph' ? 'VICTORY' : WORD[s.emo] || s.emo.toUpperCase();
    const who = (sc.me == null ? (c.side ? 'THE BLACK ' : 'THE WHITE ') : mine ? 'YOUR ' : 'ENEMY ') + TN[c.type];
    s.text = lineFor(s.emo, s.tag || sc.spec.tag, { v: sc.spec.victim ? Tn[sc.spec.victim] : null, p: Tn[c.type] });
    if (d.root) { d.root.style.setProperty('--cc', COL[s.emo] || '#ffd27a'); d.word.textContent = word; d.who.textContent = who; d.line.textContent = '“' + s.text + '”'; d.word.classList.add('show'); d.who.classList.add('show'); d.line.classList.toggle('show', !sc.short); }
    A.stinger && A.stinger(STING[s.emo] || s.emo, s.dur + 0.2, { big: s.tag === 'mate' });
    if (!sc.short && this.o.say) { const sid = c.id; setTimeout(() => { if (this.active === sc && sc.i === i && !sc.ending) this.o.say(sid, c.type, s.text, VOICE_EMO[s.emo] || 'calm'); }, 250); }
  }
  /** skip with a short fade (tap / key / gamepad) */
  skip() { const sc = this.active; if (!sc) return false; if (!sc.ending || sc.t < sc.endAt) { sc.ending = true; sc.endAt = sc.t; sc.outDur = 0.2; sc.skipped = true; sc.skipFrames = 0; sc.skipMs = performance.now(); this.A.stingerStop && this.A.stingerStop(0.3); const l = this.log[this.log.length - 1]; if (l) l.skipped = true; } return true; }
  /** a move arrived: get out of the way (immediate = no fade) */
  cut(immediate) { const sc = this.active; if (!sc) return; if (immediate) { this.A.stingerStop && this.A.stingerStop(0.1); this.finish(); } else { this.skip(); sc.outDur = 0.12; } }
  resetThrottle() { this.coolPiece.clear(); this.coolEmo.clear(); this.lastEnd = -1e9; }
  idle() { return this.active ? this.active.promise : Promise.resolve(); }
  update(dt) {
    const sc = this.active; if (!sc) return;
    const nowMs = performance.now(), raw = (sc.lastMs ? (nowMs - sc.lastMs) / 1000 : dt) / (this.o.timeScale || 1), dtw = Math.min(0.25, raw); sc.lastMs = nowMs; if (sc.skipFrames != null) sc.skipFrames++;
    // wait (up to 2.5 s) for the atlas of the current shot to arrive; give up if it cannot load
    const cur = sc.shots[Math.max(0, sc.i)], tx = this.tex.get(cur.clip.f);
    if (!sc.ending && (!tx || !tx.ready)) { sc.wait += raw; if ((tx && tx.failed) || sc.wait > 2.5) { sc.failed = true; const l = this.log[this.log.length - 1]; if (l) l.failed = true; this.finish(); } return; }
    sc.t += dtw; const t = sc.t;
    if (!sc.ending && t >= sc.endAt) sc.ending = true;
    if (sc.ending && t >= sc.endAt + sc.outDur) { this.finish(); return; }
    let i = 0, acc = 0; for (; i < sc.shots.length - 1; i++) { if (t < acc + sc.shots[i].dur) break; acc += sc.shots[i].dur; }
    if (i !== sc.i && !sc.ending) { const nt = this.tex.get(sc.shots[i].clip.f); if (nt && nt.ready) this.enterShot(i); else if (nt && nt.failed) { this.finish(); return; } }
    if (sc.i < 0) this.enterShot(0);
    const s = sc.shots[sc.i], lt = cl(t - sc.shotT0, 0, s.dur), clip = s.clip;
    const f = Math.min(clip.n - 1, Math.floor(lt * clip.fps * sc.rate));
    const m = this.mat.map; if (m) { const col = f % clip.cols, row = Math.floor(f / clip.cols); m.offset.set(col / clip.cols, 1 - (row + 1) / clip.rows); }
    // fade in over the first 0.12 s of the scene, out over outDur at the end (a death clip ends faded to nothing anyway)
    const e = cl(t / 0.12) * (sc.ending ? 1 - cl((t - sc.endAt) / sc.outDur) : 1);
    this.mat.opacity = e;
    if (!s.hid && e > 0.55) { s.c.root.visible = false; s.hid = true; }
    if (sc.ending && !s.keepHidden && s.c.alive && !s.c.root.visible && t - sc.endAt > sc.outDur * 0.35) s.c.root.visible = true;
    // camera-facing quad: centre 0.62 above the square (the reference camera's look point), 1.98 squares wide
    const R = this.R, q = this.quad; q.visible = true;
    q.position.set(s.P.x, QUAD_LIFT, s.P.z); q.quaternion.copy(R.cam.quaternion); q.scale.set(QUAD_W, QUAD_W, 1);
  }
  finish() {
    const sc = this.active; if (!sc) return; this.active = null;
    this.quad.visible = false; this.mat.opacity = 0;
    for (const s of sc.shots) if (s.hid && s.c.alive && !(s.keepHidden && !sc.failed && sc.i >= 0)) s.c.root.visible = true;
    const d = this.dom; if (d.root) { d.root.classList.remove('on'); d.root.classList.add('hidden'); for (const k of ['word', 'who', 'line']) d[k] && d[k].classList.remove('show'); }
    this.lastEnd = this.now(); { const l = this.log[this.log.length - 1]; if (l && sc.skipFrames != null) { l.framesAfterSkip = sc.skipFrames; l.msAfterSkip = Math.round(performance.now() - sc.skipMs); } if (l) l.ms = Math.round(performance.now() - l.at); if (l) l.shown = sc.i >= 0; }
    this.o.onEnd && this.o.onEnd(sc);
    sc.resolve({ skipped: !!sc.skipped, shown: sc.i >= 0, failed: !!sc.failed });
  }
  state() { const sc = this.active; return { mode: this.mode, active: !!sc, emo: sc ? sc.spec.emo : null, shot: sc && sc.i >= 0 ? sc.shots[sc.i].emo : null, clip: sc && sc.i >= 0 ? sc.shots[sc.i].clip.f : null, t: sc ? +sc.t.toFixed(2) : 0, total: sc ? +sc.total.toFixed(2) : 0, e: +this.mat.opacity.toFixed(2), quad: this.quad.visible, played: this.log.length, clips: CLIPS.length }; }
}
