/* NEURO ARENA: the Pong court. Units: court is W x 1 (y up), time in ms. */
export const COURT = { W: 1.6, H: 1, padX: [0.06, 1.54], padH: 0.18, padV: 2.4e-3 /* units per ms */, r: 0.016, v0: 1.7e-3, vMax: 2.6e-3 };
export class Pong {
  constructor(rnd) { this.rnd = rnd; this.pad = [0.5, 0.5]; this.score = [0, 0]; this.hits = [0, 0]; this.miss = [0, 0]; this.rally = 0; this.rallies = []; this.serve(this.rnd() < 0.5 ? 0 : 1); this.events = []; }
  serve(toward) {
    const a = (this.rnd() - 0.5) * 1.2, sp = COURT.v0;
    this.bx = COURT.W / 2; this.by = 0.2 + 0.6 * this.rnd();
    this.vx = (toward === 0 ? -1 : 1) * sp * Math.cos(a); this.vy = sp * Math.sin(a);
    this.rally = 0; this.wait = 250; // ms pause before ball moves
  }
  // cmd: paddle commands in [-1,1]; dt ms
  step(cmd, dt) {
    const C = COURT, h = C.padH / 2;
    for (let p = 0; p < 2; p++) { let y = this.pad[p] + cmd[p] * C.padV * dt; this.pad[p] = y < h ? h : y > 1 - h ? 1 - h : y; }
    if (this.wait > 0) { this.wait -= dt; return; }
    this.bx += this.vx * dt; this.by += this.vy * dt;
    if (this.by < C.r) { this.by = 2 * C.r - this.by; this.vy = -this.vy; }
    if (this.by > 1 - C.r) { this.by = 2 * (1 - C.r) - this.by; this.vy = -this.vy; }
    for (let p = 0; p < 2; p++) {
      const px = C.padX[p], dir = p === 0 ? -1 : 1;
      const crossed = p === 0 ? this.bx - C.r <= px && this.vx < 0 : this.bx + C.r >= px && this.vx > 0;
      if (!crossed) continue;
      const off = (this.by - this.pad[p]) / (h + C.r);
      if (Math.abs(off) <= 1) {
        const sp = Math.min(C.vMax, Math.hypot(this.vx, this.vy) * 1.04), ang = off * 0.95;
        this.vx = -dir * sp * Math.cos(ang); this.vy = sp * Math.sin(ang);
        this.bx = px - dir * C.r; this.hits[p]++; this.rally++; this.events.push({ t: 'hit', p, off });
      } else if (p === 0 ? this.bx < -0.04 : this.bx > C.W + 0.04) {
        this.miss[p]++; this.score[1 - p]++; this.rallies.push(this.rally); this.events.push({ t: 'miss', p });
        this.serve(p);
      }
    }
  }
  // egocentric sensory variables for player p: ball y, own paddle y, ball proximity, vy (all 0..1)
  view(p) {
    const C = COURT, prox = 1 - Math.abs(this.bx - C.padX[p]) / C.W;
    return [this.by, this.pad[p], Math.max(0, Math.min(1, prox)), Math.max(0, Math.min(1, 0.5 + this.vy / (2 * C.vMax)))];
  }
}
