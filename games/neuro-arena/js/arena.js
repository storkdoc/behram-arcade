/* NEURO ARENA: a match between two players (spiking brains, a human, or a random baseline). */
import { Brain, DT } from './brain.js';
import { Pong, COURT } from './pong.js';
export { Brain, Pong, COURT };
const reflect = y => { y = ((y % 2) + 2) % 2; return y > 1 ? 2 - y : y; };

export class Match {
  // players: [{brain}|{human:true}|{random:true}|{track:true}]
  constructor(players, rnd, opts = {}) {
    this.P = players; this.rnd = rnd; this.pong = new Pong(rnd); this.t = 0; this.prevErr = [0, 0]; this.cmd = [0, 0];
    this.prevPad = [0.5, 0.5]; this.vel = [0, 0]; this.lastPt = [-1, -1]; this.lastHit = -1; this.ctxOn = [new Uint8Array(16), new Uint8Array(16)]; this.aim = [{ ret: 0, won: 0 }, { ret: 0, won: 0 }];   // returns, and returns the opponent then missed (winners)
    this.humanY = 0.5; this.humanCmd = 0; this.randCmd = [0, 0]; this.critT = 0; this.opts = opts; this.seg = []; this.segAt = [0, 0, 0, 0]; if (opts.manualServe) this.pong.hold = true;
  }
  stepMs(ms) {
    const pg = this.pong, C = COURT;
    for (let k = 0; k < ms; k++) {
      for (let p = 0; p < 2; p++) {
        const pl = this.P[p];
        if (pl.brain) {
          const b = pl.brain, v = pg.view(p);
          b.sense(this.target(p, b.g.anticip), v[1], v[2], v[3]);
          if (b.ux) b.senseCtx(this.ctx(p));
          b.run(Math.round(1 / DT));
          this.cmd[p] = b.out;
        } else if (pl.human) {
          if (this.humanCmd) this.cmd[p] = this.humanCmd; else { const d = this.humanY - pg.pad[p]; this.cmd[p] = Math.abs(d) < 0.004 ? 0 : Math.max(-1, Math.min(1, d / (C.padV * 16))); }
        } else if (pl.fixed != null) {   // a statue: holds its paddle at one height (the Understanding probe's enemy)
          const d = pl.fixed - pg.pad[p]; this.cmd[p] = Math.max(-1, Math.min(1, d / (C.padV * 8)));
        } else if (pl.track) {
          const d = pg.by - pg.pad[p]; this.cmd[p] = Math.max(-1, Math.min(1, d / (C.padV * 30)));
        } else {
          if ((this.t % 100) === 0) this.randCmd[p] = this.rnd() * 2 - 1;
          this.cmd[p] = this.randCmd[p];
        }
      }
      pg.step(this.cmd, 1);
      for (let p = 0; p < 2; p++) { this.vel[p] = this.vel[p] * 0.9 + 0.1 * (pg.pad[p] - this.prevPad[p]) / C.padV; this.prevPad[p] = pg.pad[p]; }
      this.t++;
      if (this.t % 5000 === 0) {   // lifetime-learning record: hits / misses per side in each 5 s of the match
        const a = this.segAt, now = [pg.hits[0], pg.miss[0], pg.hits[1], pg.miss[1]];
        this.seg.push(now.map((v, i) => v - a[i])); this.segAt = now;
      }
      // rewards -> dopamine
      for (const ev of pg.events) {
        const b = this.P[ev.p].brain, o = this.P[1 - ev.p].brain;
        if (ev.t === 'hit') { this.lastHit = ev.p; this.aim[ev.p].ret++; } else { if (this.lastHit === 1 - ev.p) this.aim[1 - ev.p].won++; this.lastPt[1 - ev.p] = 1; this.lastPt[ev.p] = 0; this.lastHit = -1; }
        if (ev.t === 'hit' && b) b.reward(b.g.hitR);
        if (ev.t === 'miss') { if (b) b.reward(-b.g.missR); if (o) o.reward(0.3 * o.g.hitR); }
        if (ev.t === 'miss' && this.opts.manualServe) pg.hold = true;
        if (this.onEvent) this.onEvent(ev);
      }
      pg.events.length = 0;
      // innate critic: phasic dopamine for moving toward the (anticipated) ball, a dip for moving away (every 5 ms)
      if (++this.critT >= 5) {
        this.critT = 0;
        for (let p = 0; p < 2; p++) {
          const b = this.P[p].brain; if (!b || pg.wait > 0) continue;
          const err = this.target(p, b.g.anticip) - pg.pad[p], c = b.g.critic * 0.1;
          const r = Math.abs(err) > C.padH * 0.25 ? c * this.cmd[p] * Math.sign(err) : -c * 0.5 * Math.abs(this.cmd[p]);
          b.reward(r);
        }
      }
    }
  }
  // KNOW YOURSELF / KNOW YOUR ENEMY context for player p (PONG_UX.ctx_ order)
  ctx(p) {
    const o = this.ctxOn[p], q = 1 - p, pg = this.pong, vm = this.vel[p], ve = this.vel[q]; o.fill(0);
    o[vm > 0.25 ? 0 : vm < -0.25 ? 2 : 1] = 1; if (this.lastPt[p] === 1) o[3] = 1; else if (this.lastPt[p] === 0) o[4] = 1; if (this.lastHit === p) o[5] = 1;
    o[6 + Math.max(0, Math.min(5, Math.floor(pg.pad[q] * 6)))] = 1; o[ve > 0.25 ? 12 : ve < -0.25 ? 14 : 13] = 1; if (this.lastHit === q) o[15] = 1;
    return o;
  }
  target(p, ant) {
    const pg = this.pong, C = COURT;
    return ant > 0 ? reflect((pg.by + pg.vy * ant - C.r) / (1 - 2 * C.r)) * (1 - 2 * C.r) + C.r : pg.by;
  }
  stats() {
    const pg = this.pong, hr = p => (pg.hits[p] + pg.miss[p]) ? pg.hits[p] / (pg.hits[p] + pg.miss[p]) : 0;
    const rl = pg.rallies.length ? pg.rallies.reduce((a, b) => a + b, 0) / pg.rallies.length : pg.rally;
    return { score: [...pg.score], hits: [...pg.hits], miss: [...pg.miss], hitRate: [hr(0), hr(1)], rally: rl, t: this.t, seg: this.seg.map(x => [...x]) };
  }
}
