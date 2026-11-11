/* RELAX rover and astronaut.
   Two small rigid bodies share the bowl with the steel ball. The ball is
   heavy; it pushes them, spins them, and now and then knocks one over.
   They slide on the sand (viscous drag plus a nudge down the local slope),
   bounce off the rim and each other, and leave a faint track. */
(function (root) {
  'use strict';

  function Actors(rand) {
    this.rand = rand;
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, r: 0.046, m: 3.6, kind: 'ball' };
    this.rover = {
      kind: 'rover', x: -0.22, y: 0.16, vx: 0.02, vy: -0.01, ang: 0.4, av: 0,
      r: 0.078, m: 1.05, pose: 'up', poseT: 0, downFor: 2.2
    };
    this.astro = {
      kind: 'astro', x: 0.24, y: -0.18, vx: -0.015, vy: 0.02, ang: -0.8, av: 0,
      r: 0.070, m: 0.72, pose: 'up', poseT: 0, downFor: 1.8
    };
    this.stats = { hits: 0, flips: 0, roverFlips: 0, astroFlips: 0, roverHits: 0, astroHits: 0, maxJ: 0 };
    this.puffs = [];
    this._px = 0; this._py = 0;
  }

  function expDamp(v, k, dt) { return v * Math.exp(-k * dt); }

  Actors.prototype._rim = function (b) {
    const maxR = 0.905 - b.r;
    const d = Math.hypot(b.x, b.y);
    if (d <= maxR || d < 1e-6) return;
    const nx = b.x / d, ny = b.y / d;
    b.x = nx * maxR;
    b.y = ny * maxR;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) {
      b.vx -= 1.25 * vn * nx;
      b.vy -= 1.25 * vn * ny;
      b.vx *= 0.86;
      b.vy *= 0.86;
      b.av += (-b.vx * ny + b.vy * nx) * 1.6;
    }
  };

  Actors.prototype._body = function (b, dt, sand) {
    const g = sand.gradient(b.x, b.y);
    b.vx += -g.x * 0.34 * dt;
    b.vy += -g.y * 0.34 * dt;
    b.vx += (this.rand() - 0.5) * 0.05 * dt;
    b.vy += (this.rand() - 0.5) * 0.05 * dt;
    const drag = b.pose === 'down' ? 3.6 : 1.85;
    b.vx = expDamp(b.vx, drag, dt);
    b.vy = expDamp(b.vy, drag, dt);
    b.av = expDamp(b.av, 2.3, dt);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ang += b.av * dt;
    this._rim(b);
    if (b.pose !== 'up') {
      b.poseT += dt;
      const dur = b.pose === 'tip' ? 0.48 : b.pose === 'down' ? b.downFor : 0.8;
      if (b.poseT >= dur) {
        b.poseT = 0;
        b.pose = b.pose === 'tip' ? 'down' : b.pose === 'down' ? 'rise' : 'up';
        if (b.pose === 'down') b.downFor = (b.kind === 'rover' ? 2.0 : 1.5) + this.rand() * 1.5;
      }
    }
  };

  function separate(a, b) {
    let dx = b.x - a.x, dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (dist >= min) return 0;
    if (dist < 1e-6) { dx = 1; dy = 0; dist = 1e-6; }
    const nx = dx / dist, ny = dy / dist;
    const overlap = min - dist;
    const ima = 1 / a.m, imb = 1 / b.m, im = ima + imb;
    a.x -= nx * overlap * (ima / im);
    a.y -= ny * overlap * (ima / im);
    b.x += nx * overlap * (imb / im);
    b.y += ny * overlap * (imb / im);
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const velN = rvx * nx + rvy * ny;
    if (velN >= 0) return 0;
    const e = 0.2;
    const j = -(1 + e) * velN / im;
    a.vx -= j * nx * ima;
    a.vy -= j * ny * ima;
    b.vx += j * nx * imb;
    b.vy += j * ny * imb;
    const tx = -ny, ty = nx;
    const velT = rvx * tx + rvy * ty;
    const jt = Math.max(-j * 0.5, Math.min(j * 0.5, -velT / im));
    a.vx -= jt * tx * ima;
    a.vy -= jt * ty * ima;
    b.vx += jt * tx * imb;
    b.vy += jt * ty * imb;
    a.av -= jt * 2.2 * ima;
    b.av += jt * 2.2 * imb;
    return j;
  }

  Actors.prototype._tip = function (b, j) {
    if (!b.pose || b.kind === 'ball') return;
    /* The astronaut is lighter, so a smaller shove tumbles them. A hard
       spin from a glancing hit counts too. */
    const need = b.kind === 'astro' ? 0.09 : 0.16;
    if (b.pose === 'up' && (j > need || Math.abs(b.av) > 1.3)) {
      b.pose = 'tip';
      b.poseT = 0;
      b.av += (this.rand() - 0.5) * 1.4;
      this.stats.flips++;
      if (b.kind === 'rover') this.stats.roverFlips++;
      else this.stats.astroFlips++;
      this._puff(b.x, b.y, 5);
    }
  };

  Actors.prototype._puff = function (x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const s = 0.02 + this.rand() * 0.04;
      this.puffs.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45 + this.rand() * 0.35, max: 0.8 });
    }
    if (this.puffs.length > 48) this.puffs.splice(0, this.puffs.length - 48);
  };

  Actors.prototype.update = function (dt, sand, magnet, user, carve) {
    const steps = 2;
    const h = dt / steps;
    const cut = carve !== false;
    for (let s = 0; s < steps; s++) {
      const b = this.ball;
      const px = b.x, py = b.y;
      this._pull(b, magnet.x, magnet.y, h, 1);
      if (user) this._pull(b, user.x, user.y, h, 1.25);
      b.vx = expDamp(b.vx, 1.55, h);
      b.vy = expDamp(b.vy, 1.55, h);
      b.x += b.vx * h;
      b.y += b.vy * h;
      this._rim(b);
      this._body(this.rover, h, sand);
      this._body(this.astro, h, sand);
      const j1 = separate(b, this.rover);
      const j2 = separate(b, this.astro);
      const j3 = separate(this.rover, this.astro);
      this._rim(b);
      this._rim(this.rover);
      this._rim(this.astro);
      if (j1 > 0.05) {
        this.stats.hits++; this.stats.roverHits++;
        if (j1 > this.stats.maxJ) this.stats.maxJ = j1;
        this._tip(this.rover, j1);
        this._puff((b.x + this.rover.x) / 2, (b.y + this.rover.y) / 2, 3);
      }
      if (j2 > 0.05) {
        this.stats.hits++; this.stats.astroHits++;
        if (j2 > this.stats.maxJ) this.stats.maxJ = j2;
        this._tip(this.astro, j2);
        this._puff((b.x + this.astro.x) / 2, (b.y + this.astro.y) / 2, 3);
      }
      if (j3 > 0.08) this._puff((this.rover.x + this.astro.x) / 2, (this.rover.y + this.astro.y) / 2, 2);
      if (cut) {
        sand.carveSegment(px, py, b.x, b.y, 0.042, 1.25);
        this._track(this.rover, sand);
        this._track(this.astro, sand);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) this.puffs.splice(i, 1);
    }
    this._px = this.ball.x;
    this._py = this.ball.y;
  };

  Actors.prototype._pull = function (b, mx, my, dt, strength) {
    const dx = mx - b.x, dy = my - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-5) return;
    const accel = Math.min(2.0, 9 * dist) * strength;
    b.vx += (dx / dist) * accel * dt;
    b.vy += (dy / dist) * accel * dt;
  };

  Actors.prototype._track = function (b, sand) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 0.012) return;
    sand.carve(b.x, b.y, b.kind === 'rover' ? 0.022 : 0.016, b.pose === 'down' ? 0.22 : 0.16);
  };

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }

  function poseBlend(b) {
    if (b.pose === 'up') return 0;
    if (b.pose === 'tip') return Math.min(1, b.poseT / 0.48);
    if (b.pose === 'down') return 1;
    return 1 - Math.min(1, b.poseT / 0.8);
  }

  Actors.prototype.draw = function (ctx, cx, cy, scale, time) {
    this._drawRover(ctx, cx, cy, scale, time);
    this._drawAstro(ctx, cx, cy, scale, time);
    this._drawPuffs(ctx, cx, cy, scale);
  };

  Actors.prototype._drawPuffs = function (ctx, cx, cy, scale) {
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      const a = Math.max(0, p.life / p.max);
      ctx.beginPath();
      ctx.fillStyle = 'rgba(90, 42, 24, ' + (a * 0.35) + ')';
      ctx.arc(cx + p.x * scale, cy + p.y * scale, (2.2 + (1 - a) * 5), 0, 7);
      ctx.fill();
    }
  };

  Actors.prototype._drawRover = function (ctx, cx, cy, scale, time) {
    const b = this.rover;
    const s = b.r * scale;
    const x = cx + b.x * scale, y = cy + b.y * scale;
    const down = poseBlend(b);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.ang);
    ctx.scale(1, 1 - down * 0.55);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.15, s * 0.95, s * 1.15, 0, 0, 7);
    ctx.fill();
    /* six wheels */
    ctx.fillStyle = '#2a211c';
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        roundRect(ctx, side * s * 0.62, i * s * 0.58 - s * 0.16, s * 0.28, s * 0.32, s * 0.06);
        ctx.fill();
        ctx.fillStyle = '#4a3a30';
        ctx.fillRect(side * s * 0.66, i * s * 0.58 - s * 0.1, s * 0.2, s * 0.05);
        ctx.fillStyle = '#2a211c';
      }
    }
    /* chassis */
    const body = ctx.createLinearGradient(-s, -s, s, s);
    body.addColorStop(0, '#c4553a');
    body.addColorStop(0.5, '#8d3828');
    body.addColorStop(1, '#5c2418');
    ctx.fillStyle = body;
    roundRect(ctx, -s * 0.58, -s * 0.95, s * 1.16, s * 1.9, s * 0.22);
    ctx.fill();
    /* solar deck */
    ctx.fillStyle = '#1c3a66';
    roundRect(ctx, -s * 0.38, -s * 0.35, s * 0.76, s * 0.95, s * 0.06);
    ctx.fill();
    ctx.fillStyle = 'rgba(150, 200, 235, 0.35)';
    roundRect(ctx, -s * 0.28, -s * 0.22, s * 0.56, s * 0.28, s * 0.04);
    ctx.fill();
    /* mast and camera, drawn as a solid post rather than a stroke */
    ctx.fillStyle = '#d7d0c4';
    roundRect(ctx, -s * 0.07, -s * 1.28, s * 0.14, s * 0.62, s * 0.07);
    ctx.fill();
    ctx.fillStyle = '#f2efe6';
    ctx.beginPath();
    ctx.arc(0, -s * 1.32, s * 0.16, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#1a2740';
    ctx.beginPath();
    ctx.arc(s * 0.04, -s * 1.34, s * 0.07, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(s * 0.02, -s * 1.37, s * 0.025, 0, 7);
    ctx.fill();
    ctx.restore();

    if (down > 0.35) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.ang + Math.sin(time * 3) * 0.08 * down);
      ctx.globalAlpha = Math.min(1, (down - 0.35) / 0.4);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.35, s * 1.1, s * 0.35, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#6e3224';
      roundRect(ctx, -s * 0.95, -s * 0.15, s * 1.7, s * 0.55, s * 0.12);
      ctx.fill();
      ctx.fillStyle = '#241814';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(-s * 0.55 + i * s * 0.5, s * 0.42, s * 0.2, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = '#f4f0e6';
      ctx.beginPath();
      ctx.arc(s * 0.72, -s * 0.22, s * 0.14, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#1a2740';
      ctx.beginPath();
      ctx.arc(s * 0.76, -s * 0.24, s * 0.06, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  };

  Actors.prototype._drawAstro = function (ctx, cx, cy, scale, time) {
    const b = this.astro;
    const s = b.r * scale;
    const x = cx + b.x * scale, y = cy + b.y * scale;
    const down = poseBlend(b);
    const walk = Math.sin(time * 3.2 + b.ang) * Math.min(1, Math.hypot(b.vx, b.vy) * 16);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.ang + (b.pose === 'tip' ? b.poseT * 4 : 0));
    ctx.globalAlpha = 1 - down * 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.2, s * 0.7, s * 0.95, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#f4f1ea';
    ctx.beginPath();
    ctx.ellipse(-s * 0.2, s * 0.42 + walk * s * 0.06, s * 0.14, s * 0.30, 0.2, 0, 7);
    ctx.ellipse(s * 0.2, s * 0.42 - walk * s * 0.06, s * 0.14, s * 0.30, -0.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#c4552a';
    ctx.beginPath();
    ctx.ellipse(-s * 0.24, s * 0.72 + walk * s * 0.08, s * 0.16, s * 0.1, 0, 0, 7);
    ctx.ellipse(s * 0.26, s * 0.72 - walk * s * 0.08, s * 0.16, s * 0.1, 0, 0, 7);
    ctx.fill();
    /* torso and backpack */
    ctx.fillStyle = '#f7f4ee';
    roundRect(ctx, -s * 0.42, -s * 0.35, s * 0.84, s * 0.7, s * 0.16);
    ctx.fill();
    ctx.fillStyle = '#d9d3c8';
    roundRect(ctx, -s * 0.22, -s * 0.15, s * 0.2, s * 0.42, s * 0.05);
    ctx.fill();
    ctx.fillStyle = '#e07040';
    ctx.beginPath();
    ctx.arc(0, -s * 0.02, s * 0.08, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#f7f4ee';
    ctx.beginPath();
    ctx.ellipse(-s * 0.52, s * 0.05 + walk * s * 0.04, s * 0.12, s * 0.22, 0.5, 0, 7);
    ctx.ellipse(s * 0.52, -s * 0.02 - walk * s * 0.04, s * 0.12, s * 0.22, -0.4, 0, 7);
    ctx.fill();
    /* helmet */
    const helm = ctx.createRadialGradient(-s * 0.08, -s * 0.62, s * 0.05, 0, -s * 0.5, s * 0.42);
    helm.addColorStop(0, '#ffffff');
    helm.addColorStop(0.7, '#e7e2d8');
    helm.addColorStop(1, '#b7b1a6');
    ctx.fillStyle = helm;
    ctx.beginPath();
    ctx.arc(0, -s * 0.52, s * 0.4, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#1b2430';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.5, s * 0.24, s * 0.2, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 196, 90, 0.9)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120, 210, 220, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-s * 0.06, -s * 0.56, s * 0.1, s * 0.06, -0.4, 0, 7);
    ctx.fill();
    ctx.restore();

    if (down > 0.4) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.ang);
      ctx.globalAlpha = Math.min(1, (down - 0.4) / 0.35);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.15, s * 1.15, s * 0.38, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#f7f4ee';
      ctx.beginPath();
      ctx.ellipse(-s * 0.55, s * 0.1, s * 0.34, s * 0.12, 0.25, 0, 7);
      ctx.ellipse(-s * 0.48, -s * 0.08, s * 0.30, s * 0.11, -0.3, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#f7f4ee';
      roundRect(ctx, -s * 0.25, -s * 0.28, s * 0.85, s * 0.5, s * 0.16);
      ctx.fill();
      ctx.fillStyle = '#efeae2';
      ctx.beginPath();
      ctx.arc(s * 0.7, -s * 0.05, s * 0.32, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#1b2430';
      ctx.beginPath();
      ctx.ellipse(s * 0.78, -s * 0.05, s * 0.16, s * 0.12, 0.3, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  };

  root.RelaxActors = Actors;
})(window);
