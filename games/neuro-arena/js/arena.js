/* NEURO ARENA: a match between two players (spiking brains, a human, or a random baseline). */
import { Brain, DT } from './brain.js';
import { Pong, COURT } from './pong.js';
export { Brain, Pong, COURT };
const reflect = y => { y = ((y % 2) + 2) % 2; return y > 1 ? 2 - y : y; };

export class Match {
  // players: [{brain}|{human:true}|{random:true}|{track:true}]
  constructor(players, rnd, opts = {}) {
    this.P = players; this.rnd = rnd; this.pong = new Pong(rnd); this.t = 0; this.prevErr = [0, 0]; this.cmd = [0, 0];
    this.humanY = 0.5; this.humanCmd = 0; this.randCmd = [0, 0]; this.critT = 0; this.opts = opts; if (opts.manualServe) this.pong.hold = true;
  }
  stepMs(ms) {
    const pg = this.pong, C = COURT;
    for (let k = 0; k < ms; k++) {
      for (let p = 0; p < 2; p++) {
        const pl = this.P[p];
        if (pl.brain) {
          const b = pl.brain, v = pg.view(p);
          b.sense(this.target(p, b.g.anticip), v[1], v[2], v[3]);
          b.run(Math.round(1 / DT));
          this.cmd[p] = b.out;
        } else if (pl.human) {
          if (this.humanCmd) this.cmd[p] = this.humanCmd; else { const d = this.humanY - pg.pad[p]; this.cmd[p] = Math.abs(d) < 0.004 ? 0 : Math.max(-1, Math.min(1, d / (C.padV * 16))); }
        } else if (pl.track) {
          const d = pg.by - pg.pad[p]; this.cmd[p] = Math.max(-1, Math.min(1, d / (C.padV * 30)));
        } else {
          if ((this.t % 100) === 0) this.randCmd[p] = this.rnd() * 2 - 1;
          this.cmd[p] = this.randCmd[p];
        }
      }
      pg.step(this.cmd, 1);
      this.t++;
      // rewards -> dopamine
      for (const ev of pg.events) {
        const b = this.P[ev.p].brain, o = this.P[1 - ev.p].brain;
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
  target(p, ant) {
    const pg = this.pong, C = COURT;
    return ant > 0 ? reflect((pg.by + pg.vy * ant - C.r) / (1 - 2 * C.r)) * (1 - 2 * C.r) + C.r : pg.by;
  }
  stats() {
    const pg = this.pong, hr = p => (pg.hits[p] + pg.miss[p]) ? pg.hits[p] / (pg.hits[p] + pg.miss[p]) : 0;
    const rl = pg.rallies.length ? pg.rallies.reduce((a, b) => a + b, 0) / pg.rallies.length : pg.rally;
    return { score: [...pg.score], hits: [...pg.hits], miss: [...pg.miss], hitRate: [hr(0), hr(1)], rally: rl, t: this.t };
  }
}
