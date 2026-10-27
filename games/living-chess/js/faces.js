/* ==========================================================================
   LIVING CHESS — faces.js : canvas-animated faces (mapped onto the 3D
   pieces as CanvasTextures, and drawn large in the dialogue portrait).
   Every emotion is a blend of expression parameters (brows, lids, pupils,
   mouth curve/open, tears, sweat, blush, sparkle), eased over time, with
   blinking, saccades toward what the piece is looking at, and a mouth
   that opens on speech word boundaries.
   ========================================================================== */
const EXPR = {
  //        browIn browUp lid  pupil curve open  width tears sweat blush spark squint
  calm:    [0,     0,     1.0, 1.0,  0.25, 0.0,  0.9,  0,    0,    0,    0,    0],
  terror:  [1.0,   0.9,   1.4, 0.55, -0.7, 0.75, 0.75, 0.2,  1,    0,    0,    0],
  horror:  [1.0,   1.0,   1.5, 0.45, -0.8, 1.0,  0.8,  0.4,  1,    0,    0,    0],
  pain:    [0.7,   0.2,   0.7, 0.9,  -0.8, 0.35, 1.0,  0.3,  0.4,  0,    0,    0.8],
  anxiety: [0.6,   0.4,   1.1, 0.8,  -0.35, 0.1, 0.7,  0,    0.6,  0,    0,    0],
  pride:   [-0.3,  0.1,   0.75, 1.0, 0.65, 0.0,  1.0,  0,    0,    0.2,  0.2,  0.2],
  thrill:  [-0.5,  0.3,   1.15, 1.2, 0.95, 0.55, 1.15, 0,    0,    0.4,  1,    0],
  longing: [0.5,   0.5,   1.05, 1.25, 0.15, 0.05, 0.75, 0.1, 0,    0.3,  0.6,  0],
  resolve: [-0.8,  -0.1,  0.85, 1.0, -0.05, 0.0, 0.85, 0,    0,    0,    0.3,  0.3],
  grief:   [1.0,   0.3,   0.55, 1.0, -0.9, 0.2,  0.9,  1,    0,    0,    0,    0.2],
  joy:     [0.2,   0.6,   1.0, 1.1,  1.0,  0.6,  1.2,  0,    0,    0.7,  0.5,  1.0],
  cheer:   [0.2,   0.7,   1.0, 1.1,  1.0,  0.9,  1.25, 0,    0,    0.8,  0.6,  1.0],
  dead:    [0,     0,     0.0, 1.0, -0.4,  0.1,  0.8,  0,    0,    0,    0,    0],
};
const N = 12;
export const EMO_COLORS = { calm: '#9fb6c8', terror: '#ff3b3b', horror: '#ff2d55', pain: '#ff7a45', anxiety: '#ffb347', pride: '#ffd76a', thrill: '#ffe14a', longing: '#6fe3ff', resolve: '#b78bff', grief: '#6f8dff', joy: '#7dff9a', cheer: '#7dff9a', dead: '#555' };
export const EMO_LABEL = { calm: 'CALM', terror: 'TERROR', horror: 'HORROR', pain: 'PAIN', anxiety: 'DREAD', pride: 'PRIDE', thrill: 'THRILL', longing: 'LONGING', resolve: 'RESOLVE', grief: 'GRIEF', joy: 'JOY', cheer: 'JOY', dead: 'FALLEN' };

export class Face {
  constructor(size, side, opts = {}) {
    this.c = document.createElement('canvas'); this.c.width = size; this.c.height = Math.round(size * (opts.aspect || 0.8));
    this.x = this.c.getContext('2d'); this.side = side; this.size = size; this.opts = opts;
    this.p = EXPR.calm.slice(); this.target = 'calm'; this.inten = 0.3;
    this.look = { x: 0, y: 0 }; this.lookT = { x: 0, y: 0 }; this.blink = 0; this.nextBlink = 1 + Math.random() * 3; this.mouth = 0; this.mouthT = 0; this.t = Math.random() * 10;
    this.dirty = true; this.frame = 0; this.shake = 0;
  }
  set(emo, inten = 0.6) { if (emo !== this.target || inten !== this.inten) { this.target = EXPR[emo] ? emo : 'calm'; this.inten = inten; this.dirty = true; } }
  lookAt(x, y) { this.lookT.x = Math.max(-1, Math.min(1, x)); this.lookT.y = Math.max(-1, Math.min(1, y)); }
  talk(k) { this.mouthT = Math.max(this.mouthT, k); }
  update(dt) {
    this.t += dt; const tgt = EXPR[this.target]; const k = Math.min(1, dt * 7);
    // intensity scales the expression away from calm
    for (let i = 0; i < N; i++) { const base = EXPR.calm[i], v = base + (tgt[i] - base) * Math.min(1.15, 0.45 + this.inten * 0.7); this.p[i] += (v - this.p[i]) * k; }
    if (this.target === 'dead') { this.blink = 1; }
    else {
      this.nextBlink -= dt; if (this.nextBlink <= 0) { this.blink = 1; this.nextBlink = (this.target === 'terror' || this.target === 'anxiety' ? 0.8 : 2.2) + Math.random() * 3; }
      this.blink = Math.max(0, this.blink - dt * 7);
    }
    // saccades: jittery when afraid
    const jit = (this.target === 'terror' || this.target === 'horror') ? 0.25 : this.target === 'anxiety' ? 0.12 : 0.03;
    this.look.x += (this.lookT.x + (Math.random() - 0.5) * jit - this.look.x) * Math.min(1, dt * 10);
    this.look.y += (this.lookT.y + (Math.random() - 0.5) * jit - this.look.y) * Math.min(1, dt * 10);
    this.mouthT = Math.max(0, this.mouthT - dt * 5); this.mouth += (this.mouthT - this.mouth) * Math.min(1, dt * 18);
    this.dirty = true;
  }
  draw() {
    const x = this.x, W = this.c.width, H = this.c.height, s = W / 100, p = this.p;
    const [browIn, browUp, lid0, pupil, curve, open0, width, tears, sweat, blush, spark, squint] = p;
    const dark = this.side === 1;
    x.clearRect(0, 0, W, H);
    if (this.opts.bg) { const g = x.createRadialGradient(W / 2, H * 0.45, 4, W / 2, H / 2, W * 0.7); g.addColorStop(0, this.opts.bg[0]); g.addColorStop(1, this.opts.bg[1]); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    const tremble = (this.target === 'terror' || this.target === 'horror') ? Math.sin(this.t * 60) * 0.8 * s : 0;
    x.save(); x.translate(W / 2 + tremble, H * 0.5 + (this.opts.yoff || 0) * s);
    const ink = dark ? '#f4e6c8' : '#2a1a10', lineW = 2.6 * s;
    // blush
    if (blush > 0.05) { x.fillStyle = `rgba(255,90,110,${0.35 * blush})`; for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(sx * 27 * s, 9 * s, 9 * s, 5 * s, 0, 0, 7); x.fill(); } }
    // eyes
    const eyeY = -6 * s, eyeX = 17 * s, ew = 10.5 * s, eh = 11 * s * Math.min(1.5, lid0) * (1 - 0.92 * this.blink) * (1 - 0.35 * squint);
    const happyArc = curve > 0.85 && squint > 0.6 && open0 > 0.4; // ^^ eyes
    for (const sx of [-1, 1]) {
      const cx = sx * eyeX; x.save(); x.translate(cx, eyeY);
      if (happyArc || this.blink > 0.85 || eh < 1.2 * s) {
        x.strokeStyle = ink; x.lineWidth = lineW; x.lineCap = 'round'; x.beginPath();
        if (happyArc) x.arc(0, 3 * s, ew * 0.8, Math.PI * 1.15, Math.PI * 1.85); else { x.moveTo(-ew, 0); x.quadraticCurveTo(0, 3 * s, ew, 0); }
        x.stroke();
      } else {
        x.fillStyle = '#fbf8f2'; x.strokeStyle = ink; x.lineWidth = lineW * 0.8;
        x.beginPath(); x.ellipse(0, 0, ew, eh, 0, 0, 7); x.fill(); x.stroke();
        x.save(); x.beginPath(); x.ellipse(0, 0, ew, eh, 0, 0, 7); x.clip();
        const px = this.look.x * ew * 0.45, py = this.look.y * eh * 0.4, ir = 6.2 * s * Math.min(1.1, 0.6 + pupil * 0.4);
        x.fillStyle = dark ? '#d38b2a' : '#3a78c9'; x.beginPath(); x.arc(px, py, ir, 0, 7); x.fill();
        x.fillStyle = '#0b0705'; x.beginPath(); x.arc(px, py, ir * 0.55 * pupil, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(px - ir * 0.35, py - ir * 0.4, ir * 0.28, 0, 7); x.fill();
        if (spark > 0.3) { x.globalAlpha = spark; x.beginPath(); x.arc(px + ir * 0.35, py + ir * 0.25, ir * 0.15, 0, 7); x.fill(); x.globalAlpha = 1; }
        // upper lid for sleepy/proud or squint
        if (lid0 < 0.95 || squint > 0.2) { x.fillStyle = dark ? '#231812' : '#e9dcc4'; const cover = eh * 2 * Math.max(0, (0.95 - lid0) * 0.9 + squint * 0.25); x.fillRect(-ew - 2, -eh - 2, ew * 2 + 4, cover); }
        x.restore();
      }
      // brows: inner end raises for fear/sadness, lowers for anger/resolve
      const by = -eh - 7 * s - browUp * 6 * s;
      x.strokeStyle = ink; x.lineWidth = lineW * 1.2; x.lineCap = 'round'; x.beginPath();
      const inner = -sx * ew * 1.0, outer = sx * ew * 1.05;
      x.moveTo(inner, by - browIn * 6 * s); x.quadraticCurveTo(0, by - 3 * s - browIn * 2 * s, outer, by + browIn * 3 * s); x.stroke();
      // tears
      if (tears > 0.15) { const ty = eh + ((this.t * 22 + (sx > 0 ? 10 : 0)) % 26) * s; x.fillStyle = `rgba(120,200,255,${0.85 * tears})`; x.beginPath(); x.ellipse(sx * 3 * s, ty, 2.4 * s, 3.6 * s, 0, 0, 7); x.fill(); x.fillRect(-1, eh, 2.2 * s * sx, (ty - eh) * 0.6); }
      x.restore();
    }
    // sweat drop
    if (sweat > 0.15) { const y = -22 * s + ((this.t * 14) % 18) * s; x.fillStyle = `rgba(150,215,255,${0.9 * sweat})`; x.beginPath(); x.moveTo(36 * s, y - 6 * s); x.quadraticCurveTo(41 * s, y + 2 * s, 36 * s, y + 4 * s); x.quadraticCurveTo(31 * s, y + 2 * s, 36 * s, y - 6 * s); x.fill(); }
    // mouth
    const my = 22 * s, mw = 14 * s * width, op = Math.min(1.2, open0 + this.mouth * 0.9), c = curve * 9 * s;
    x.strokeStyle = ink; x.lineWidth = lineW; x.lineCap = 'round'; x.lineJoin = 'round';
    if (op < 0.08) { x.beginPath(); x.moveTo(-mw, my - c * 0.5); x.quadraticCurveTo(0, my + c, mw, my - c * 0.5); x.stroke(); }
    else {
      const oh = op * 13 * s;
      x.fillStyle = '#3b0d12'; x.beginPath();
      x.moveTo(-mw, my - c * 0.4); x.quadraticCurveTo(0, my + c * 0.6 - oh * 0.15, mw, my - c * 0.4);
      x.quadraticCurveTo(0, my + c * 0.6 + oh, -mw, my - c * 0.4); x.closePath(); x.fill(); x.stroke();
      if (op > 0.35) { x.save(); x.clip(); x.fillStyle = '#fff6ee'; x.fillRect(-mw, my - c * 0.4 - 6 * s, mw * 2, 5.5 * s); x.fillStyle = '#e0586a'; x.beginPath(); x.ellipse(0, my + c * 0.6 + oh * 0.75, mw * 0.55, oh * 0.35, 0, 0, 7); x.fill(); x.restore(); }
    }
    x.restore();
    this.dirty = false; this.frame++;
  }
}
export { EXPR };
